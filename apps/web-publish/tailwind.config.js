import evcPreset from '@entire-vc/tokens/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
	presets: [evcPreset],
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: 'class'
};
