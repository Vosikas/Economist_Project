import { create } from 'zustand';

const useAlertStore = create((set) => ({
    isVisible: false,
    title: '',
    message: '',
    buttons: [],
    options: {},
    showAlert: (title, message, buttons = [], options = {}) => {
        set({
            isVisible: true,
            title,
            message,
            // Provide a default OK button if none are supplied, mimicking native Alert
            buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'ΟΚ', onPress: () => {} }],
            options: { type: 'info', ...options }
        });
    },
    hideAlert: () => set({ isVisible: false })
}));

export default useAlertStore;
