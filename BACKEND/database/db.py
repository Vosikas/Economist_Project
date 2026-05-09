import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

# Φόρτωση μεταβλητών περιβάλλοντος
load_dotenv()

# Σύνθεση του Database URL
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Δημιουργία του Engine
engine = create_engine(DATABASE_URL)

# Εργοστάσιο παραγωγής Sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Η βάση για τα ORM Models
Base = declarative_base()

def create_tables():
    """
    Αυτή η συνάρτηση "χτίζει" τους πίνακες στη βάση δεδομένων.
    Το import των models γίνεται ΕΔΩ μέσα για να αποφύγουμε το Circular Import Error,
    καθώς τα models κάνουν import το Base από αυτό εδώ το αρχείο.
    """
    from database import models 
    print("🔨 SQLAlchemy: Δημιουργία πινάκων (αν δεν υπάρχουν)...")
    Base.metadata.create_all(bind=engine)
    print("✅ SQLAlchemy: Η δομή της βάσης είναι έτοιμη.")

def get_db():
    """
    FastAPI Dependency: Παρέχει ένα DB Session για κάθε request και το κλείνει αυτόματα στο τέλος.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()