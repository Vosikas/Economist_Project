import os
import json
from groq import Groq
from dotenv import load_dotenv

# 1. Φόρτωση του API Key
load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    print("❌ Σφάλμα: Δεν βρέθηκε το GROQ_API_KEY στο αρχείο .env")
    exit(1)

# Αρχικοποίηση του Groq Client
client = Groq(api_key=GROQ_API_KEY)

# =====================================================================
# 2. Η Λειτουργία Παραγωγής (Network Layer)
# =====================================================================
# =====================================================================
# 2. Η Λειτουργία Παραγωγής (Network Layer)
# =====================================================================
def generate_questions(context: str, num_questions: int = 5):
    print(f"\n⚡ Επικοινωνία με Groq (Llama 3.3 70B)... (Παραγωγή {num_questions} ερωτήσεων)")
    
    # Προσθέσαμε τον Κανόνα #2 για τους τόνους και τα κεφαλαία/μικρά
    system_prompt = """Είσαι ένας αυστηρός καθηγητής ΑΟΘ Γ' Λυκείου.
Η αποστολή σου είναι να διαβάσεις το κείμενο που θα σου δώσει ο χρήστης και να βγάλεις ερωτήσεις ΑΠΟΚΛΕΙΣΤΙΚΑ από αυτό.
ΠΡΕΠΕΙ ΝΑ ΕΠΙΣΤΡΕΨΕΙΣ ΑΥΣΤΗΡΑ ΕΝΑ ΕΓΚΥΡΟ JSON OBJECT (χωρίς markdown, χωρίς επιπλέον κείμενο), με την εξής ακριβώς δομή:

{
  "questions": [
    {
      "type": "multiple_choice",
      "question": "Κείμενο ερώτησης",
      "explanation": "Σύντομη εξήγηση σωστής απάντησης",
      "options": ["Λάθος1", "Λάθος2", "Σωστό", "Λάθος3"],
      "correct_answer": "Σωστό",
      "correct_answers": [],
      "pairs": []
    },
    {
      "type": "fill_in",
      "question": "Η συνολική αξία όλων των αγαθών ονομάζεται _____.",
      "explanation": "Ορισμός ΑΕΠ",
      "options": [],
      "correct_answer": "",
      "correct_answers": ["ΑΕΠ", "αεπ"],
      "pairs": []
    }
  ]
}

ΟΔΗΓΙΕΣ:
1. Δημιούργησε ένα μείγμα από multiple_choice και fill_in. Αν ένα πεδίο δεν χρειάζεται, άφησέ το ως άδεια λίστα [] ή κενό string "".
2. ΣΗΜΑΝΤΙΚΟ ΓΙΑ FILL_IN: Στο πεδίο "correct_answers", πρέπει ΠΑΝΤΑ να γράφεις τις αποδεκτές απαντήσεις ΚΑΙ ΜΕ ΤΟΝΟΥΣ ΚΑΙ ΧΩΡΙΣ ΤΟΝΟΥΣ. π.χ. αν η απάντηση είναι "αγαθό", το array πρέπει να είναι ["αγαθό", "αγαθο", "Αγαθό", "ΑΓΑΘΟ"]. Αυτό είναι αυστηρός κανόνας για να βοηθήσουμε τους μαθητές που πληκτρολογούν γρήγορα."""

    user_prompt = f"ΚΕΙΜΕΝΟ ΘΕΩΡΙΑΣ:\n{context}\n\nΒγάλε {num_questions} ερωτήσεις σε JSON format."

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.2 
        )
        
        result_json = json.loads(response.choices[0].message.content)
        return result_json
        
    except Exception as e:
        print(f"\n❌ Σφάλμα: {e}")
        return None

# =====================================================================
# 3. Εκτέλεση (Για δοκιμή)
# =====================================================================
if __name__ == "__main__":
    sample_context = """
    Η ζήτηση ενός αγαθού προσδιορίζεται από την τιμή του, το εισόδημα των καταναλωτών, 
    τις προτιμήσεις τους, τις τιμές των υποκατάστατων και συμπληρωματικών αγαθών, 
    και τον αριθμό των καταναλωτών. Σύμφωνα με το Νόμο της Ζήτησης, όταν η τιμή ενός αγαθού 
    αυξάνεται, η ζητούμενη ποσότητα μειώνεται, ceteris paribus (όταν όλοι οι άλλοι παράγοντες παραμένουν σταθεροί).
    """
    
    print("⏳ Ξεκινάμε το Test Script...")
    
    output = generate_questions(sample_context, num_questions=2)
    
    if output:
        print("\n✅ ΕΠΙΤΥΧΙΑ! Το Groq επέστρεψε το εξής JSON (σε δέκατα του δευτερολέπτου):")
        print(json.dumps(output, indent=2, ensure_ascii=False))