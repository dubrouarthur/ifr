// Loads every area stylesheet in this folder, after src/styles.css (imported first by main.ts).
import.meta.glob('./*.css', { eager: true });
