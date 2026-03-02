// src/services/apiClient.js
import tokenStorage from "./tokenstorage";

const BASE_URL = "http://10.0.2.2:8000"; 

const apiFetch = async (endpoint, method = 'GET', body = null) => {
    try {
        const headers = {
            'Content-Type': 'application/json',
        };

        const token = await tokenStorage.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const options = {
            method: method,
            headers: headers,
        };

        if (method !== 'GET' && body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${BASE_URL}${endpoint}`, options);
        
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Κάτι πήγε στραβά με το API.');
        }

        
        return data;

    } catch (error) {
        console.error('API Error στο apiClient:', error);
        throw error; 
    }
};

export default apiFetch;