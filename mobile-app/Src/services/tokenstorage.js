import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'economist_access_token';
const REFRESH_TOKEN_KEY = 'economist_refresh_token';

const tokenStorage = {
    // Σώζει ΚΑΙ τα δύο tokens
    saveTokens: async (accessToken, refreshToken) => {
        try {
            await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
            if (refreshToken) {
                await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
            }
        } catch (error) {
            console.error("Error saving tokens", error);
        }
    },

    // Φέρνει το Access Token
    getAccessToken: async () => {
        try { return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY); } 
        catch (error) { return null; }
    },

    // Φέρνει το Refresh Token
    getRefreshToken: async () => {
        try { return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY); } 
        catch (error) { return null; }
    },

    // Διαγράφει ΚΑΙ τα δύο tokens (για το Logout)
    removeTokens: async () => {
        try {
            await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
            await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
        } catch (error) {
            console.error("Error removing tokens", error);
        }
    }
};

export default tokenStorage;