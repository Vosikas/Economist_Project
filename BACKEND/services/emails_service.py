async def send_verification_email(email: str, token: str):
    verification_link = f"https://economist-api.onrender.com/verify?token={token}"
    
    print("\n" + "="*50)
    print(f"🚀 [MOCK EMAIL - VERIFICATION] Προσομοίωση αποστολής στο: {email}")
    print(f"🔗 Πάτα αυτό το link για επιβεβαίωση:")
    print(f"{verification_link}")
    print("="*50 + "\n")
    
    return True

async def send_reset_password(email: str, token: str):
    reset_link = f"https://economist-api.onrender.com/reset-password?token={token}"
    
    print("\n" + "="*50)
    print(f"🚀 [MOCK EMAIL - RESET PASS] Προσομοίωση αποστολής στο: {email}")
    print(f"🔗 Πάτα αυτό το link για αλλαγή κωδικού:")
    print(f"{reset_link}")
    print("="*50 + "\n")
    
    return True