/**
 * Decodes HTML entities and removes problematic leading/trailing 
 * whitespace or invisible characters.
 */
export const smartClean = (html: string): string => {
    if (typeof window === 'undefined') return html.trim();
    
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    
    // .trim() removes standard spaces and newlines
    // .replace(/\u00A0/g, ' ') replaces non-breaking spaces if they exist
    return txt.value.trim().replace(/\u00A0/g, ' ');
};