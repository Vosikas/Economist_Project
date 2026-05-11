import os
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from pydantic import EmailStr
from dotenv import load_dotenv
from fastapi.responses import HTMLResponse, FileResponse
load_dotenv()

emailconfig = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"),
    MAIL_PORT=int(os.getenv("MAIL_PORT")),
    MAIL_SERVER=os.getenv("MAIL_SERVER"),
    MAIL_STARTTLS=False,
    MAIL_SSL_TLS=True,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True
)

async def send_verification_email(email: EmailStr, token: str,response_class=HTMLResponse):
    # Προσοχή: Εδώ βάζεις το πραγματικό URL του Backend σου που θα δέχεται το token!
    verification_link = f"{os.getenv('API_URL')}/verify-email?token={token}"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Ενεργοποίηση Λογαριασμού</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table width="100%" max-width="500" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 40px; text-align: center; max-width: 500px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                        <tr>
                            <td align="center" style="padding-bottom: 30px;">
                                <div style="font-size: 56px; font-weight: 900; color: #f1f5f9; letter-spacing: -2px; margin: 0; text-shadow: 0 0 10px rgba(16, 185, 129, 0.2);">
                                    20<span style="color: #10b981; margin-left: 2px;">E</span>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <h2 style="color: #10b981; font-size: 24px; font-weight: 700; margin-top: 0; margin-bottom: 16px;">Επιβεβαίωση Λογαριασμού 🏆</h2>
                                <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
                                    Καλώς ήρθες στον κόσμο του ΑΟΘ! Είσαι ένα βήμα μακριά από το να ξεκινήσεις το ταξίδι σου. Για να ενεργοποιήσεις το λογαριασμό σου, πάτα το παρακάτω κουμπί.
                                </p>
                                <a href="{verification_link}" style="background-color: #10b981; color: #ffffff; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; margin-bottom: 32px; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3);">
                                    Επιβεβαίωση Λογαριασμού
                                </a>
                            </td>
                        </tr>
                        <tr>
                            <td style="border-top: 1px solid #334155; padding-top: 24px;">
                                <p style="color: #64748b; font-size: 14px; margin-bottom: 16px;">
                                    Αν δεν έκανες εγγραφή, απλά αγνόησε αυτό το email.
                                </p>
                                <div style="color: #0ea5e9; font-size: 14px; font-weight: 500;">
                                    <span style="cursor: pointer; margin: 0 10px;">Υποστήριξη</span> | <span style="cursor: pointer; margin: 0 10px;">Όροι Χρήσης</span>
                                </div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    message = MessageSchema(
        subject="20_E | Ενεργοποίηση Λογαριασμού 🛡️",
        recipients=[email],  
        body=html_content,
        subtype=MessageType.html
    )
    
    fm = FastMail(emailconfig)
    await fm.send_message(message)


async def send_reset_password(email: EmailStr, otp: str):
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Επαναφορά Κωδικού</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
            <tr>
                <td align="center">
                    <table width="100%" max-width="500" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 12px; border: 1px solid #334155; padding: 40px; text-align: center; max-width: 500px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                        <tr>
                            <td align="center" style="padding-bottom: 30px;">
                                <div style="font-size: 56px; font-weight: 900; color: #f1f5f9; letter-spacing: -2px; margin: 0; text-shadow: 0 0 10px rgba(16, 185, 129, 0.2);">
                                    20<span style="color: #10b981; margin-left: 2px;">E</span>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <h2 style="color: #10b981; font-size: 24px; font-weight: 700; margin-top: 0; margin-bottom: 16px;">Αίτημα Επαναφοράς 👾</h2>
                                <p style="color: #94a3b8; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
                                    Λάβαμε ένα αίτημα για επαναφορά του κωδικού σου. Χρησιμοποίησε το παρακάτω 6ψήφιο PIN στην εφαρμογή για να συνεχίσεις:
                                </p>
                                
                                <div style="background-color: #0f172a; border: 2px solid #10b981; border-radius: 12px; padding: 24px; margin-bottom: 32px; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06);">
                                    <span style="font-size: 40px; font-weight: 800; color: #10b981; letter-spacing: 12px; font-family: monospace;">{otp}</span>
                                </div>

                                <p style="color: #64748b; font-size: 14px; margin-bottom: 32px;">
                                    Το PIN λήγει σε 15 λεπτά. Αν δεν έκανες εσύ το αίτημα, μπορείς να αγνοήσεις αυτό το μήνυμα με ασφάλεια.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="border-top: 1px solid #334155; padding-top: 24px;">
                                <div style="color: #0ea5e9; font-size: 14px; font-weight: 500;">
                                    <span style="cursor: pointer; margin: 0 10px;">Υποστήριξη</span> | <span style="cursor: pointer; margin: 0 10px;">Όροι Χρήσης</span>
                                </div>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    message = MessageSchema(
        subject="20_E | System Override (PIN) 🚨",
        recipients=[email],  
        body=html_content,
        subtype=MessageType.html
    )
    
    fm = FastMail(emailconfig)
    await fm.send_message(message)