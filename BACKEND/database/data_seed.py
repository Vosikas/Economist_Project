import json
import os
from db import SessionLocal, engine, Base
from models import Chapter, Level, Question, User, UserProgress, UserMistake

def seed_database():
    # 1. Δυναμικός εντοπισμός του αρχείου lessons.json
    # Βρίσκει το path του τρέχοντος αρχείου (data_seed.py) και κοιτάζει στον ίδιο φάκελο
    base_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(base_dir, 'lessons.json')

    # 2. Ανοίγουμε σύνδεση με τη βάση
    db = SessionLocal()
    
    try:
        if not os.path.exists(json_path):
            raise FileNotFoundError(f"Το αρχείο {json_path} δεν βρέθηκε!")

        # 3. Διαβάζουμε το JSON αρχείο
        with open(json_path, 'r', encoding='utf-8') as file:
            data = json.load(file)
        
        print("🚀 Ξεκινάει η εισαγωγή δεδομένων (Seeding)...")
        
        for ch_data in data['chapters']:
            # Εισαγωγή/Ενημέρωση Κεφαλαίου
            chapter = Chapter(
                id=ch_data['id'],
                title=ch_data['title'],
                description=ch_data.get('description', ''),
                order_num=ch_data['order_num'],
                is_premium=ch_data.get('is_premium', False)
            )
            db.merge(chapter) # update αν υπάρχει, insert αν δεν υπάρχει
            db.flush() 
            print(f"✅ Κεφάλαιο: {chapter.title}")
            
            for lvl_data in ch_data['levels']:
                # Μοναδικό ID για το level: π.χ. "ch-1_lvl-1"
                unique_lvl_id = f"{ch_data['id']}_{lvl_data['id']}"

                new_level = Level(
                    id=unique_lvl_id,
                    chapter_id=ch_data['id'],
                    title=lvl_data['title'],
                    order_num=lvl_data['order_num'],
                    xp_reward=lvl_data.get('xp_reward', 100),
                    min_xp_required=lvl_data.get('min_xp_required', 0)
                )
                db.merge(new_level)
                db.flush()
                print(f"  ➡️ Level: {new_level.title} (ID: {unique_lvl_id})")
                
                for q_data in lvl_data['questions']:
                    new_question = Question(
                        id=q_data['id'],
                        level_id=unique_lvl_id,
                        question_type=q_data['type'],
                        question_text=q_data['question'],
                        options=q_data.get('options'),
                        correct_answer=q_data.get('correct_answer'),
                        correct_answers=q_data.get('correct_answers'),
                        pairs=q_data.get('pairs'),
                        explanation=q_data.get('explanation')
                    )
                    db.merge(new_question)
            
        # 4. Αποθήκευση όλων στη βάση
        db.commit()
        print("\n🎉 Το Seeding ολοκληρώθηκε επιτυχώς!")

    except Exception as e:
        print(f"\n❌ Σφάλμα κατά το Seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    # Αυτό εξασφαλίζει ότι οι πίνακες θα δημιουργηθούν πριν μπούν τα δεδομένα
    print("🔨 Δημιουργία πινάκων στη βάση (αν δεν υπάρχουν ήδη)...")
    Base.metadata.create_all(bind=engine)
    seed_database()