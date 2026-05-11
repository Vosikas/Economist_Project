async def send_verification_email(email: list, token: str):
    # Φτιάξε το link επιβεβαίωσης όπως το είχες
    verification_link = f"https://economist-api.onrender.com/verify?token={token}"
    
    # ΑΝΤΙ ΓΙΑ fm.send_message(message), βάλε αυτό:
    print("\n" + "="*50)
    print(f"🚀 [MOCK EMAIL] Προσομοίωση αποστολής στο: {email}")
    print(f"🔗 Πάτα αυτό το link για επιβεβαίωση:")
    print(f"{verification_link}")
    print("="*50 + "\n")
    
    return True