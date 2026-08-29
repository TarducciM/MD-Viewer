# Esempio di progetto

Questa cartella serve solo a **provare il viewer**: apri questa cartella con il pulsante *Apri cartella* e naviga i file dalla sidebar a sinistra.

## Cosa c'è dentro

- [x] Un file di primo livello (questo)
- [x] Una sottocartella con un altro file `.md`
- [ ] Aggiungine altri quando vuoi

## Un blocco di codice

```ts
interface Doc {
  title: string;
  tags: string[];
}

function summarize(doc: Doc): string {
  // esempio di evidenziazione sintattica
  return `${doc.title} (${doc.tags.join(", ")})`;
}
```

## Una tabella

| Funzione | Stato |
| --- | --- |
| Sidebar con albero file | ✅ |
| Syntax highlighting | ✅ |
| Editing (`Ctrl+E`) | ✅ |

> Suggerimento: prova a ridimensionare la sidebar trascinando il bordo destro.
