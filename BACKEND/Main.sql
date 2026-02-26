CREATE TABLE user_profile (
    id UUID PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(20) DEFAULT 'student', 
    is_premium BOOLEAN DEFAULT FALSE,
    stripe_customer_id VARCHAR(255),    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);