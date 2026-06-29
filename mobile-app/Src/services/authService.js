/**
 * FILE SUMMARY: authService.js
 * * PRIMARY PURPOSE: 
 * Manages raw API communication for user authentication (signup, login, password reset).
 */
import api from './apiClient'; // Το μετονομάσαμε σε api για να είναι πιο ξεκάθαρο
import tokenStorage from './tokenstorage';

const authService = {
    signup: async (username, email, password) => {
        // ΣΩΣΤΗ ΚΛΗΣΗ AXIOS (χωρίς τη λέξη 'POST' σαν παράμετρο)
        const response = await api.post('/signup', { 
            username: username, 
            email: email, 
            password: password 
        });
        return response.data;
    },

    login: async (username, password) => {
        // Πολύ πιο καθαρό με το Axios! Γλιτώνουμε headers και JSON.stringify
        const response = await api.post('/login', {
            username: username,
            password: password
        });

        const data = response.data;

        if (data && data.access_token) {
            console.log('[Auth] Token generated at login:', `${data.access_token.substring(0, 20)}...`);
            
            // ΠΡΟΣΟΧΗ: Το backend πλέον επιστρέφει ΚΑΙ access_token ΚΑΙ refresh_token
            // Οπότε καλούμε τη μέθοδο saveTokens (πληθυντικός) του tokenstorage.js
            await tokenStorage.saveTokens(data.access_token, data.refresh_token);
        }

        // Επιστρέφουμε τα δεδομένα συν το rawToken για το Zustand (Race condition fix)
        return { ...data, rawToken: data.access_token ?? null };
    },

    logout: async () => {
        // Καλό είναι να ενημερώνουμε και το backend να διαγράψει το refresh_token
        try {
            const refreshToken = await tokenStorage.getRefreshToken();
            if (refreshToken) {
                await api.post('/logout', { refresh_token: refreshToken });
            }
        } catch (error) {
            console.log("To backend logout απέτυχε, προχωράμε στο τοπικό logout.");
        } finally {
            await tokenStorage.removeTokens(); // Πληθυντικός, διαγράφει και τα δύο
        }
    }, 

    forgotPassword: async (email) => {
        // ΣΩΣΤΗ ΚΛΗΣΗ AXIOS
        const response = await api.post('/forgot-password', { 
            email: email 
        });
        return response.data;
    },

    resetPassword: async (email, otp, newPassword) => {
        // Καθαρίσαμε και το reset password!
        const response = await api.post('/reset-password', {
            email: email,          
            otp: otp,              
            new_password: newPassword
        });
        
        return response.data;
    },
};

export default authService;