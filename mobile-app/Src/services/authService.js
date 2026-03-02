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
        const data = await apiFetch('/login', 'POST', { 
            username: username, 
            password: password 
        });

        if (data && data.access_token) {
            await tokenStorage.saveToken(data.access_token);
        }

        return data;
    },

    logout: async () => {
        await tokenStorage.removeToken();
    }
};

export default authService;