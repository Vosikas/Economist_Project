from fastapi import APIRouter, Depends, HTTPException, status
from datetime import date


from sqlalchemy.orm import Session
from datetime import datetime, date
import json
from pydantic import BaseModel
from schemas import SubmitScoreRequest
from database.db import get_db
from database.models import User, DailyQuiz, DailyQuizAttempt
from api.mobile.auth import get_current_user # Προσαρμόσου στο δικό σου path

router = APIRouter(prefix="/daily-quiz", tags=["Mobile — Daily Quiz"])
def get_today_midnight():
    # Επιστρέφει τη σημερινή ημερομηνία με ώρα 00:00:00
    today = date.today()
    return datetime.combine(today, datetime.min.time())

# --- ENDPOINTS ---

@router.get("/today")
def get_todays_quiz(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Επιστρέφει το σημερινό quiz. Αν ο χρήστης το έχει ήδη παίξει, επιστρέφει error.
    """
    today_midnight = get_today_midnight()
    
    # 1. Βρες το σημερινό Quiz
    quiz = db.query(DailyQuiz).filter(DailyQuiz.date_active == today_midnight).first()
    
    if not quiz:
        # Αν δεν υπάρχει, σημαίνει ότι το AI (Cron Job) δεν έτρεξε χθες το βράδυ.
        # Μπορείς να επιστρέφεις ένα fallback quiz ή 404.
        raise HTTPException(status_code=404, detail="Το σημερινό Daily Quiz δεν έχει δημιουργηθεί ακόμα.")

    # 2. Έλεγξε αν ο χρήστης το έχει ήδη παίξει
    attempt = db.query(DailyQuizAttempt).filter(
        DailyQuizAttempt.user_id == current_user.id,
        DailyQuizAttempt.quiz_id == quiz.id
    ).first()

    if attempt:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Έχεις ήδη παίξει το σημερινό Quiz! Έλα πάλι αύριο."
        )

    # 3. Επιστροφή των ερωτήσεων
    # Το AI μας το έσωσε ως String, το κάνουμε parse σε JSON
    try:
        questions = json.loads(quiz.questions_json)
    except:
        questions = []

    return {
        "quiz_id": quiz.id,
        "questions": questions
    }

@router.post("/submit")
def submit_daily_score(
    request: SubmitScoreRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Αποθηκεύει το σκορ του παίκτη. Αν προσπαθήσει να κλέψει (2η φορά), η βάση θα το μπλοκάρει.
    """
    
    # 1. Βρίσκουμε το Quiz
    quiz = db.query(DailyQuiz).filter(DailyQuiz.id == request.quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Το Quiz δεν βρέθηκε.")
        
    # 2. Προσπαθούμε να αποθηκεύσουμε την προσπάθεια (Το Database Index μας προστατεύει εδώ)
    new_attempt = DailyQuizAttempt(
        user_id=current_user.id,
        quiz_id=quiz.id,
        score=request.score,
        total_time_ms=request.total_time_ms
    )
    
    db.add(new_attempt)
    
    try:
        # Αποθηκεύουμε το attempt
        db.commit()
    except Exception as e:
        db.rollback()
        # Αν σκάσει, σημαίνει ότι υπάρχει ήδη εγγραφή λόγω του UniqueConstraint
        raise HTTPException(status_code=400, detail="Δεν μπορείς να παίξεις 2η φορά το Daily Quiz.")

    # 3. Επιβράβευση (Τα Double XP!)
    # Ας πούμε ότι κάθε σωστή δίνει 10 XP, άρα διπλό = 20 XP ανά σωστή.
    xp_earned = request.score * 20
    current_user.total_xp += xp_earned
    db.commit()
    
    # Προαιρετικό: Αν έχεις Leaderboard Cache, ίσως θες να την κάνεις invalidate εδώ
    # _invalidate_leaderboard_cache() 
    
    return {
        "message": "Το σκορ αποθηκεύτηκε επιτυχώς!",
        "xp_earned": xp_earned,
        "score": request.score,
        "time_ms": request.total_time_ms
    }
@router.post("/debug/create-dummy-quiz")
def create_dummy_quiz(db: Session = Depends(get_db)):
    """Δημιουργεί ένα εικονικό quiz για σήμερα ώστε να μπορείς να το τεστάρεις στο κινητό."""
    today = datetime.combine(date.today(), datetime.min.time())
    
    # Έλεγχος αν υπάρχει ήδη για να μην διπλοεγγραφεί
    exists = db.query(DailyQuiz).filter(DailyQuiz.date_active == today).first()
    if exists:
        return {"message": "Το σημερινό quiz υπάρχει ήδη στη βάση!"}
        
    dummy_questions = [
        {
            "id": 1, 
            "text": "Ποιο από τα παρακάτω αποτελεί προσδιοριστικό παράγοντα της ζήτησης;", 
            "options": ["Οι τιμές των παραγωγικών συντελεστών", "Οι προτιμήσεις των καταναλωτών", "Η τεχνολογία παραγωγής", "Ο αριθμός των επιχειρήσεων"], 
            "correct_index": 1
        },
        {
            "id": 2, 
            "text": "Όταν η εισοδηματική ελαστικότητα είναι αρνητική, το αγαθό ονομάζεται:", 
            "options": ["Κατώτερο", "Κανονικό", "Συμπληρωματικό", "Υποκατάστατο"], 
            "correct_index": 0
        },
        {
            "id": 3, 
            "text": "Ο νόμος της φθίνουσας απόδοσης αρχίζει να ισχύει όταν:", 
            "options": ["Το συνολικό προϊόν μειώνεται", "Το οριακό προϊόν αρχίζει να μειώνεται", "Το μέσο προϊόν είναι ίσο με το οριακό", "Το συνολικό προϊόν γίνεται μηδέν"], 
            "correct_index": 1
        }
    ]
    
    new_quiz = DailyQuiz(
        date_active=today, 
        questions_json=json.dumps(dummy_questions)
    )
    
    db.add(new_quiz)
    db.commit()
    
    return {"message": "Το Dummy Quiz δημιουργήθηκε! Τώρα το Banner στο App θα πρέπει να ανάψει."}