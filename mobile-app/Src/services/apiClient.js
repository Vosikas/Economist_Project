import tokenStorage from "./tokenstorage";

const BASE_URL = "http://192.168.2.5:8000"; // ΒΑΛΕ ΤΗΝ IP ΣΟΥ ΕΔΩ

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
            throw new Error(data.detail || 'API request failed');
        }

        return data;

    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
};

export default apiFetch;