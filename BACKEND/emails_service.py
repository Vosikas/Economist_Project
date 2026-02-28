import os
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from pydantic import EmailStr
from dotenv import load_dotenv

load_dotenv()
emailconfig = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"),
    MAIL_PORT=int(os.getenv("MAIL_PORT")),
    MAIL_SERVER=os.getenv("MAIL_SERVER"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)
async def send_verification_email(email: EmailStr, token: str):
    
    verification_link = f"http://localhost:8000/verify-email/{token}"
    
    html_content  = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #f9f9f9;">
        <h2 style="color: #333; text-align: center;">Καλωσήρθατε στην Εφαρμογή μας!</h2>
        <p style="color: #555; font-size: 16px; line-height: 1.5;">
            Χαιρόμαστε πολύ που είστε μαζί μας. Για να ολοκληρώσετε την εγγραφή σας και να αποκτήσετε πλήρη πρόσβαση, παρακαλώ επιβεβαιώστε τη διεύθυνση email σας πατώντας το παρακάτω κουμπί:
        </p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{verification_link}" style="background-color: #007bff; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block;">
                Επιβεβαίωση Λογαριασμού
            </a>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center;">
            Αν δεν κάνατε εσείς αυτή την εγγραφή, μπορείτε απλά να αγνοήσετε αυτό το email.<br>
            Το link ισχύει για 24 ώρες.
        </p>
    </div>
    """
    
    message = MessageSchema(
        subject="Επιβεβαίωση Λογαριασμού",
        recipients=[email],  
        body=html_content,
        subtype=MessageType.html
    )
    
    fm = FastMail(emailconfig)
    await fm.send_message(message)
async def send_reset_password(email : EmailStr , token: str):
    reset_link=f"http://localhost:8000/resetpassword?token={token}"
    
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
        <h2 style="color: #d9534f; text-align: center;">Επαναφορά Κωδικού Πρόσβασης</h2>
        <p style="color: #555; font-size: 16px; line-height: 1.5;">
            Γεια σας,
            <br><br>
            Λάβαμε ένα αίτημα για επαναφορά του κωδικού πρόσβασης στον λογαριασμό σας. Αν κάνατε εσείς αυτό το αίτημα, μπορείτε να ορίσετε νέο κωδικό πατώντας το παρακάτω κουμπί:
        </p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{reset_link}" style="background-color: #d9534f; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; display: inline-block;">
                Αλλαγή Κωδικού
            </a>
        </div>
        <p style="color: #555; font-size: 14px; line-height: 1.5; text-align: center;">
            <strong>Προσοχή:</strong> Το link θα λήξει σε 15 λεπτά για λόγους ασφαλείας.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
            Αν δεν ζητήσατε επαναφορά κωδικού, παρακαλούμε αγνοήστε αυτό το email. Ο κωδικός σας θα παραμείνει ο ίδιος και ο λογαριασμός σας είναι ασφαλής.
        </p>
    </div>
    """
    message = MessageSchema(
        subject="Επαναφορά Κωδικού Πρόσβασης",
        recipients=[email],  
        body=html_content,
        subtype=MessageType.html
    )
    
    fm = FastMail(emailconfig)
    await fm.send_message(message)