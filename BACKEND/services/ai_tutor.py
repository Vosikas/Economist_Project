"""
FILE: routers/ai_tutor.py
Premium AI Tutor — grading and question management endpoints.
"""
import os
import openai
from openai import OpenAI
from fastapi import APIRouter, HTTPException, Depends ,UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.db import get_db
from database.models import TheoryQuestion, User
from core.security import get_current_user
from services.rate_limiter import ai_tutor_limiter  # ← new file above
from fastapi import UploadFile, File
import tempfile
import shutil
import io


# ── OpenAI client with timeout ────────────────────────────────────────────────
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    timeout=30.0,
    max_retries=1,
)

router = APIRouter(prefix="/ai-tutor", tags=["Premium — AI Tutor"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class TutorRequest(BaseModel):
    question_id: int = Field(gt=0)
    student_answer: str = Field(min_length=10, max_length=3000)


class TutorEvaluation(BaseModel):
    score: int = Field(description="Βαθμολογία 0–100.")
    feedback: str = Field(description="Σύντομο, ενθαρρυντικό σχόλιο (1–2 προτάσεις).")
    missing_points: list[str] = Field(
        description="Λέξεις-κλειδιά ή σημεία που παραλείφθηκαν. Άδεια λίστα αν τα είπε όλα."
    )


class TheoryQuestionResponse(BaseModel):
    id: int
    chapter_id: str
    question_text: str
    # ideal_answer and keywords intentionally excluded (anti-cheat)

    class Config:
        from_attributes = True


class CreateTheoryQuestion(BaseModel):
    chapter_id: str
    question_text: str = Field(min_length=10)
    ideal_answer: str = Field(min_length=10)
    keywords: list[str] = Field(min_length=1)


# ── Prompts (module-level constants — easier to iterate on) ───────────────────

system_prompt = """
Είσαι ένας κορυφαίος και έμπειρος διορθωτής Πανελληνίων στο μάθημα ΑΟΘ (Αρχές Οικονομικής Θεωρίας).
Αποστολή σου είναι να αξιολογήσεις την απάντηση του μαθητή (student_answer) συγκρίνοντάς την με την επίσημη θεωρία (expected_answer).

ΒΑΣΙΚΟΤΕΡΟΙ ΚΑΝΟΝΕΣ ΚΑΤΑΝΟΗΣΗΣ (ΣΗΜΑΣΙΟΛΟΓΙΑ ΟΧΙ ΑΝΤΙΓΡΑΦΗ):
1. Λογική Ισοδυναμία: Να αναγνωρίζεις ΠΑΝΤΑ τις αντίστροφες ή ισοδύναμες διατυπώσεις. Π.χ. αν η θεωρία λέει "όταν αυξάνεται η τιμή, μειώνεται η ζητούμενη ποσότητα", και ο μαθητής πει "όταν μειώνεται η τιμή, αυξάνεται η ζητούμενη ποσότητα" ή "υπάρχει αρνητική/αντίστροφη σχέση", αυτό είναι ΑΠΟΛΥΤΩΣ ΣΩΣΤΟ και παίρνει άριστα.
2. Μαθηματικά & Ορολογία: Το σύμβολο ">0" είναι ακριβώς το ίδιο με τη λέξη "θετικό". Το "<0" είναι το "αρνητικό". Το "Δ" είναι η "μεταβολή". Η "ceteris paribus" είναι "τα άλλα ίσα". Να κρίνεις την ΟΥΣΙΑ και όχι τα σύμβολα.
3. Λάθη Ομιλίας: Η απάντηση είναι από αναγνώριση φωνής. Αγνοήσε πλήρως ορθογραφικά λάθη, έλλειψη σημείων στίξης ή ασύντακτες λέξεις που βγάζουν νόημα.

ΟΔΗΓΙΕΣ ΒΑΘΜΟΛΟΓΗΣΗΣ:
- Ξεκίνα με 100.
- Αφαίρεσε βαθμούς ΜΟΝΟ αν λείπει μια κρίσιμη λέξη-κλειδί ή αν η λογική του μαθητή είναι οικονομικά λάθος.

ΜΟΡΦΗ ΕΞΟΔΟΥ (ΜΟΝΟ JSON):
ΠΡΕΠΕΙ ΑΥΣΤΗΡΑ ΝΑ ΕΠΙΣΤΡΕΨΕΙΣ ΜΟΝΟ ΕΝΑ JSON ΜΕ ΤΗΝ ΕΞΗΣ ΔΟΜΗ:
{
  "reasoning": "Γράψε εδώ σύντομα τη σκέψη σου. Εντόπισες ισοδυναμίες; Έχει ο μαθητής δίκιο με δικά του λόγια;",
  "score": 85,
  "feedback": "Κείμενο feedback 2-3 προτάσεων. Μία για το τι έκανε σωστά και μία για το τι έπρεπε να πει καλύτερα.",
  "missing_points": ["Όρος 1", "Όρος 2"]
}
"""


def _build_user_prompt(question_data: TheoryQuestion, student_answer: str) -> str:
    return (
        f"Ερώτηση: {question_data.question_text}\n"
        f"Ιδανική Απάντηση (Σχολικό Βιβλίο): {question_data.ideal_answer}\n"
        f"Υποχρεωτικές Λέξεις-Κλειδιά: {', '.join(question_data.keywords)}\n\n"
        f"Απάντηση Μαθητή: {student_answer}"
    )




# ... (ο κώδικας που ήδη έχεις για client και router)

@router.post("/transcribe")
async def transcribe_student_audio(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user), 
):
    """Μετατρέπει τη φωνή του μαθητή σε κείμενο μέσω Whisper AI"""
    
    if not current_user.is_premium:
        raise HTTPException(status_code=403, detail="Απαιτείται Premium συνδρομή.")

    try:
        # Διαβάζουμε τα bytes του ήχου
        audio_bytes = await file.read()

        # Το μετατρέπουμε σε file-like object στη μνήμη (απαραίτητο για OpenAI v1.0+)
        buffer = io.BytesIO(audio_bytes)
        buffer.name = "audio.m4a"

        # Στέλνουμε στο Whisper
       # Στέλνουμε στο Whisper με αυστηρούς κανόνες
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=buffer, 
            language="el",
            prompt="Αυτή είναι η προφορική απάντηση ενός μαθητή σε ερώτηση.", # Δίνει context και κόβει τις παραισθήσεις
            temperature=0.0 # Μηδενική φαντασία, μόνο ότι ακούει
        )
        return {"text": transcript.text}
        
    except Exception as e:
        print(f"[Whisper Error]: {str(e)}") 
        raise HTTPException(status_code=500, detail="Αποτυχία αναγνώρισης φωνής.")
@router.post("/grade", response_model=TutorEvaluation)
def grade_student_answer(
    req: TutorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Grade a student's open-ended answer using GPT-4o-mini Structured Outputs."""

    if not current_user.is_premium:
        raise HTTPException(status_code=403, detail="Απαιτείται Premium συνδρομή.")

    # 20 grading requests per user per 10 minutes
    ai_tutor_limiter.check(str(current_user.id), max_calls=20, window_seconds=600)

    question_data = (
        db.query(TheoryQuestion)
        .filter(TheoryQuestion.id == req.question_id)
        .first()
    )
    if not question_data:
        raise HTTPException(status_code=404, detail="Η ερώτηση δεν βρέθηκε.")

    try:
        response = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": _build_user_prompt(question_data, req.student_answer)},
            ],
            response_format=TutorEvaluation,
            temperature=0.2,
        )
        return response.choices[0].message.parsed

    except openai.APITimeoutError:
        raise HTTPException(
            status_code=504,
            detail="Το AI Tutor δεν απάντησε εγκαίρως. Δοκίμασε ξανά σε λίγο."
        )
    except openai.RateLimitError:
        raise HTTPException(
            status_code=503,
            detail="Το σύστημα βαθμολόγησης είναι προσωρινά υπερφορτωμένο. Δοκίμασε σε 1 λεπτό."
        )
    except openai.APIError as e:
        print(f"[AI Tutor] OpenAI API error: {e}")
        raise HTTPException(status_code=500, detail="Σφάλμα επικοινωνίας με το AI.")
    except Exception as e:
        print(f"[AI Tutor] Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Εσωτερικό σφάλμα διακομιστή.")


@router.get("/questions/{chapter_id}", response_model=list[TheoryQuestionResponse])
def get_chapter_theory_questions(
    chapter_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all theory questions for a chapter. Premium-gated."""

    if not current_user.is_premium:
        raise HTTPException(status_code=403, detail="Απαιτείται Premium συνδρομή.")

    return (
        db.query(TheoryQuestion)
        .filter(TheoryQuestion.chapter_id == chapter_id)
        .order_by(TheoryQuestion.id)
        .all()
    )


@router.post("/admin/questions", status_code=201)
def create_theory_question(
    req: CreateTheoryQuestion,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a new theory question. Restricted to admin/content_editor roles."""

    if current_user.role not in ("admin", "superadmin", "content_editor"):
        raise HTTPException(status_code=403, detail="Δεν έχεις δικαίωμα πρόσβασης.")

    new_question = TheoryQuestion(
        chapter_id=req.chapter_id,
        question_text=req.question_text,
        ideal_answer=req.ideal_answer,
        keywords=req.keywords,
    )
    db.add(new_question)
    db.commit()
    db.refresh(new_question)

    return {"message": "Η ερώτηση προστέθηκε επιτυχώς!", "question_id": new_question.id}
