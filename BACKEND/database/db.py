import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

# Φόρτωση των μεταβλητών από το .env αρχείο
load_dotenv()

# Λήψη του URL από το περιβάλλον
DATABASE_URL = os.getenv("DATABASE_URL")

# Έλεγχος αν το URL υπάρχει, αλλιώς σταματάμε με μήνυμα σφάλματος
if not DATABASE_URL:
    raise ValueError(
        "\n❌ ΣΦΑΛΜΑ: Η μεταβλητή DATABASE_URL δεν βρέθηκε!\n"
        "Σιγουρέψου ότι υπάρχει αρχείο .env στον φάκελο BACKEND "
        "και ότι περιέχει τη σωστή διαδρομή."
    )

# Διόρθωση για το Render/SQLAlchemy (πρέπει να ξεκινάει με postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Δημιουργία του Engine
engine = create_engine(DATABASE_URL)

# Εργοστάσιο παραγωγής Sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Η βάση για τα ORM Models
Base = declarative_base()

def create_tables():
    from database import models 
    print("🔨 SQLAlchemy: Δημιουργία πινάκων στη βάση...")
    Base.metadata.create_all(bind=engine)
    print("✅ SQLAlchemy: Η δομή της βάσης είναι έτοιμη.")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()