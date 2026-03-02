import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'economist_access_token';

const tokenStorage = {
    saveToken: async (token) => {
        try {
            await SecureStore.setItemAsync(TOKEN_KEY, token);
        } catch (error) {
        }
    },

    getToken: async () => {
        try {
            return await SecureStore.getItemAsync(TOKEN_KEY);
        } catch (error) {
            return null;
        }
    },

    removeToken: async () => {
        try {
            await SecureStore.deleteItemAsync(TOKEN_KEY);
        } catch (error) {
        }
    }
};

export default tokenStorage;