import apiFetch from './apiClient';
import tokenStorage from './tokenstorage';

const authService = {
    signup: async (username, email, password) => {
        return await apiFetch('/signup', 'POST', { 
            username: username, 
            email: email, 
            password: password 
        });
    },

    login: async (username, password) => {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const BASE_URL = process.env.EXPO_PUBLIC_API_URL ? process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '') : '';
        
        const response = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString()
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Αποτυχία σύνδεσης');
        }

        if (data && data.access_token) {
            await tokenStorage.saveToken(data.access_token);
        }

        return data;
    },

    logout: async () => {
        await tokenStorage.removeToken();
    }, 

    forgotPassword: async (email) => {
        return await apiFetch('/forgot-password', 'POST', { 
            email: email 
        });
    },

    resetPassword: async (token, new_password) => {
        return await apiFetch('/reset-password', 'POST', { 
            token : token,
            new_password: new_password
        });
    }
};

export default authService;