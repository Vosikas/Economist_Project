import tokenStorage from "./tokenstorage";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

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

        // --- SENIOR FIX: Καθαρισμός του τελικού URL ---
        // 1. Βγάζουμε την κάθετο από το τέλος του BASE_URL (αν υπάρχει)
        const safeBaseUrl = BASE_URL ? BASE_URL.replace(/\/$/, '') : '';
        // 2. Σιγουρευόμαστε ότι το endpoint ξεκινάει με κάθετο
        const safeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        // 3. Τα ενώνουμε με ασφάλεια
        const finalUrl = `${safeBaseUrl}${safeEndpoint}`;

        // ΤΟ ΡΑΝΤΑΡ ΜΑΣ: Αυτό θα τυπωθεί στο τερματικό του Expo
        console.log(`🚀 [API FETCH] Στέλνω ${method} request στο:`, finalUrl);

        const response = await fetch(finalUrl, options);
        const data = await response.json();

       if (!response.ok) {
            let errorMessage = 'Αποτυχία αιτήματος';
            
            if (data.detail) {
                if (typeof data.detail === 'string') {
                    errorMessage = data.detail;
                } 
                else if (Array.isArray(data.detail)) {
                    errorMessage = data.detail.map(err => {
                        const fieldName = err.loc[err.loc.length - 1];
                        return `Πεδίο "${fieldName}": ${err.msg}`;
                    }).join('\n');
                }
            }
            throw new Error(errorMessage);
        }

        return data;

    } catch (error) {
        console.error('❌ [API Error]:', error);
        throw error;
    }
};

export default apiFetch;