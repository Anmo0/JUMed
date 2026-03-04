import { useEffect } from 'react';

/**
 * A hook that applies the dark theme to the application unconditionally.
 */
export function useTheme(): void {
    useEffect(() => {
        const root = window.document.documentElement;
        // Ensure the 'dark' class is always present.
        if (!root.classList.contains('dark')) {
            root.classList.add('dark');
        }
        // Persist the theme choice to prevent any potential flashes of light theme
        // if old logic was cached or runs for a moment.
        localStorage.setItem('theme', 'dark');
    }, []); // Run only once on component mount
}