// Small curated lists of common words used as a fallback autocomplete source
// (in addition to words already present in the current document). Not meant
// to be exhaustive dictionaries, just enough to make suggestions useful from
// the first keystrokes in a new document.

export const COMMON_WORDS_IT = [
  "abbastanza", "accanto", "adesso", "affinché", "aiuto", "alcuni", "allora", "alto", "altro",
  "ancora", "andare", "anno", "applicazione", "aprire", "area", "articolo", "attenzione",
  "attraverso", "avere", "avanti", "bene", "breve", "buono", "cambiare", "campo", "capire",
  "cartella", "casa", "caso", "cercare", "certo", "che", "chi", "chiaro", "chiudere", "ciao",
  "ciascuno", "cioè", "codice", "come", "comunque", "con", "contenuto", "contro", "cosa",
  "così", "creare", "cui", "dare", "davanti", "davvero", "degli", "della", "dentro",
  "descrizione", "dietro", "dire", "diverso", "documento", "dopo", "dove", "dovere",
  "durante", "editor", "elenco", "entro", "errore", "esempio", "essere", "fare", "file",
  "fine", "finestra", "finché", "fino", "forse", "forte", "funzione", "generale", "già",
  "giorno", "grande", "grazie", "guida", "guardare", "immagine", "impostazioni", "includere",
  "informazione", "inoltre", "insieme", "intorno", "invece", "lasciare", "lavoro", "leggere",
  "lettera", "licenza", "link", "lontano", "lungo", "mancare", "mano", "mentre", "mettere",
  "modo", "molto", "mondo", "mostrare", "nessuno", "niente", "nome", "nostro", "nulla",
  "nuovo", "oggi", "ogni", "oltre", "opzioni", "ordine", "ormai", "ottenere", "pagina",
  "parlare", "parola", "parte", "password", "percorso", "perché", "però", "persona",
  "piccolo", "poco", "popolare", "possibile", "potere", "preferire", "prendere", "presto",
  "prima", "primo", "problema", "progetto", "proprio", "provare", "pubblico", "punto",
  "qualche", "qualcosa", "qualcuno", "quale", "quando", "quanto", "quasi", "quello",
  "questo", "quindi", "ricerca", "ricordare", "riga", "rimanere", "rimuovere", "risultato",
  "ritornare", "salvare", "sapere", "scegliere", "scrivere", "sebbene", "secondo", "sempre",
  "sentire", "senza", "sera", "servire", "siccome", "sicuro", "significare", "simile",
  "sistema", "sopra", "sotto", "spesso", "stare", "stato", "stesso", "storia", "strumento",
  "subito", "tabella", "tanto", "tardi", "tempo", "tenere", "testo", "titolo", "tramite",
  "troppo", "trovare", "tutto", "ultimo", "utente", "utile", "valore", "vedere", "veloce",
  "venire", "verificare", "versione", "verso", "vicino", "vita", "volere", "volta",
];

export const COMMON_WORDS_EN = [
  "about", "above", "across", "action", "after", "again", "against", "also", "always",
  "another", "answer", "area", "around", "article", "available", "back", "base", "because",
  "before", "below", "between", "both", "build", "business", "call", "case", "change",
  "check", "code", "community", "company", "complete", "config", "content", "could", "create",
  "data", "default", "delete", "description", "design", "detail", "develop", "different",
  "directory", "document", "done", "down", "each", "edit", "editor", "either", "email", "end",
  "error", "even", "every", "example", "experience", "export", "extension", "feature", "field",
  "file", "find", "first", "folder", "follow", "format", "found", "function", "general",
  "good", "group", "guide", "header", "help", "here", "high", "home", "however", "image",
  "import", "include", "information", "install", "into", "issue", "item", "just", "keep",
  "key", "know", "language", "large", "last", "later", "learn", "level", "license", "like",
  "line", "link", "list", "local", "look", "main", "make", "manage", "many", "mark", "maybe",
  "might", "more", "most", "move", "much", "name", "need", "network", "next", "note", "number",
  "often", "once", "only", "open", "option", "order", "other", "over", "page", "part", "path",
  "people", "plan", "platform", "please", "point", "possible", "preview", "problem", "process",
  "project", "provide", "public", "question", "quick", "quite", "ready", "real", "reference",
  "remove", "report", "request", "require", "result", "return", "review", "right", "rule",
  "same", "save", "search", "section", "select", "send", "server", "service", "settings",
  "share", "show", "side", "similar", "simple", "since", "size", "small", "some", "source",
  "start", "state", "step", "still", "style", "such", "support", "sure", "system", "table",
  "take", "task", "team", "tell", "template", "test", "text", "their", "them", "then", "there",
  "these", "they", "this", "those", "through", "time", "title", "together", "tool", "total",
  "translate", "type", "under", "understand", "until", "update", "upload", "user", "using",
  "value", "version", "very", "view", "wait", "want", "way", "well", "what", "when", "where",
  "which", "while", "window", "with", "without", "word", "work", "write", "wrong", "year",
  "your",
];

export const COMMON_WORDS = [...COMMON_WORDS_IT, ...COMMON_WORDS_EN];
