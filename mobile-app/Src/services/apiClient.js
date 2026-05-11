// src/services/apiClient.js
import axios from 'axios';
import tokenStorage from './tokenstorage';
import useAppStore from '../store/useAppStore';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// Validate BASE_URL at startup
if (!BASE_URL) {
    console.error('❌ [CONFIG] EXPO_PUBLIC_API_URL is undefined! Check your .env file and restart Metro.');
} else {
    console.log(`✅ [CONFIG] API Base URL: ${BASE_URL}`);
}

const safeBaseUrl = BASE_URL ? BASE_URL.replace(/\/$/, '') : '';

const api = axios.create({
    baseURL: safeBaseUrl,
    timeout: 15000, // Increased for slower networks
});

// ─── REQUEST INTERCEPTOR ───────────────────────────────────────────────────
api.interceptors.request.use(
    async (config) => {
        const token = await tokenStorage.getAccessToken();
        
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Verbose request logging
        console.log('────────────────────────────────────────');
        console.log(`🚀 [REQUEST] ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
        console.log(`📦 [REQUEST] Headers:`, JSON.stringify(config.headers, null, 2));
        if (config.data) {
            // Redact password for security
            const safeData = { ...config.data };
            if (safeData.password) safeData.password = '***REDACTED***';
            console.log(`📦 [REQUEST] Body:`, JSON.stringify(safeData, null, 2));
        }
        console.log('────────────────────────────────────────');
        
        return config;
    },
    (error) => {
        // This catches errors BEFORE the request is sent (config issues, etc.)
        console.error('❌ [REQUEST SETUP ERROR] Failed before sending:', error.message);
        return Promise.reject(error);
    }
);

// ─── RESPONSE INTERCEPTOR ──────────────────────────────────────────────────
api.interceptors.response.use(
    (response) => {
        console.log(`✅ [RESPONSE] ${response.status} from ${response.config.url}`);
        return response;
    },
    async (error) => {
        // Categorize the error type
        console.log('────────────────────────────────────────');
        console.error('❌ [RESPONSE ERROR] Request failed');
        
        if (error.response) {
            // Server responded with an error status (4xx, 5xx)
            console.error(`📡 [SERVER ERROR] Status: ${error.response.status}`);
            console.error(`📡 [SERVER ERROR] Data:`, JSON.stringify(error.response.data, null, 2));
            console.error(`📡 [SERVER ERROR] URL: ${error.config?.url}`);
        } else if (error.request) {
            // Request was made but no response received
            console.error('🔌 [NETWORK ERROR] No response received from server');
            console.error('🔌 [NETWORK ERROR] Possible causes:');
            console.error('   1. Server is not running');
            console.error('   2. Wrong IP address in EXPO_PUBLIC_API_URL');
            console.error('   3. Firewall blocking the connection');
            console.error('   4. Phone and computer on different networks');
            console.error(`🔌 [NETWORK ERROR] Attempted URL: ${error.config?.baseURL}${error.config?.url}`);
            console.error(`🔌 [NETWORK ERROR] Current BASE_URL env: ${BASE_URL}`);
            
            if (error.code === 'ECONNABORTED') {
                console.error('⏱️ [TIMEOUT] Request timed out after', error.config?.timeout, 'ms');
            }
        } else {
            // Error during request setup
            console.error('⚙️ [SETUP ERROR] Error during request setup:', error.message);
        }
        
        console.error('📋 [FULL ERROR]', error.toJSON ? error.toJSON() : error);
        console.log('────────────────────────────────────────');

        // ─── 401 Refresh Logic ─────────────────────────────────────────────
        const originalRequest = error.config;
        
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            console.log('🔄 [AUTH] Access token expired, attempting refresh...');

            try {
                const refreshToken = await tokenStorage.getRefreshToken();
                
                if (!refreshToken) {
                    throw new Error('No refresh token available');
                }

                const response = await axios.post(`${safeBaseUrl}/refresh`, {
                    refresh_token: refreshToken
                });

                const { access_token, refresh_token: new_refresh_token } = response.data;
                console.log('✅ [AUTH] Token refresh successful');

                await tokenStorage.saveTokens(access_token, new_refresh_token);
                useAppStore.getState().setToken(access_token);

                originalRequest.headers.Authorization = `Bearer ${access_token}`;
                return api(originalRequest);

            } catch (refreshError) {
                console.error('❌ [AUTH] Token refresh failed, logging out');
                await tokenStorage.removeTokens();
                useAppStore.getState().logout();
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export async function handleOAuthSuccess(access_token, refresh_token) {
    await tokenStorage.saveTokens(access_token, refresh_token);
    useAppStore.getState().setToken(access_token);
}

export default api;
