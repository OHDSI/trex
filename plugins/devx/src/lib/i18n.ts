const translations: Record<string, Record<string, string>> = {
  en: {
    "chat.placeholder": "Send a message...",
    "chat.newChat": "New Chat",
    "chat.search": "Search chats...",
    "app.noApp": "No app",
    "app.create": "New App",
    "app.createTitle": "Create New App",
    "settings.title": "Settings",
    "settings.general": "General",
    "settings.ai": "AI",
    "settings.agent": "Agent",
    "settings.integrations": "Integrations",
    "settings.language": "Language",
    "preview.selectApp": "Select an app to preview",
    "preview.startServer": "Start Dev Server",
    "code.selectFile": "Select a file to view",
    "code.search": "Search files...",
    "code.noFiles": "No files in this app",
  },
  de: {
    "chat.placeholder": "Nachricht senden...",
    "chat.newChat": "Neuer Chat",
    "chat.search": "Chats durchsuchen...",
    "app.noApp": "Keine App",
    "app.create": "Neue App",
    "app.createTitle": "Neue App erstellen",
    "settings.title": "Einstellungen",
    "settings.general": "Allgemein",
    "settings.ai": "KI",
    "settings.agent": "Agent",
    "settings.integrations": "Integrationen",
    "settings.language": "Sprache",
    "preview.selectApp": "App zum Vorschauen auswahlen",
    "preview.startServer": "Dev-Server starten",
    "code.selectFile": "Datei zum Anzeigen auswahlen",
    "code.search": "Dateien durchsuchen...",
    "code.noFiles": "Keine Dateien in dieser App",
  },
};

let currentLang = localStorage.getItem("devx-lang") || "en";

export function setLanguage(lang: string) {
  currentLang = lang;
  localStorage.setItem("devx-lang", lang);
}

export function getLanguage(): string {
  return currentLang;
}

export function t(key: string): string {
  return translations[currentLang]?.[key] || translations.en[key] || key;
}

export function getAvailableLanguages(): { id: string; name: string }[] {
  return [
    { id: "en", name: "English" },
    { id: "de", name: "Deutsch" },
  ];
}
