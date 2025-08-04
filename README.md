# MindTask

MindTask è un plugin sperimentale per Obsidian che ti permette di visualizzare e organizzare i task Markdown su una lavagna interattiva. Ogni attività del tuo vault può essere trascinata, collegata e raggruppata per mantenere sempre sotto controllo il flusso di lavoro.

![Anteprima della lavagna](docs/img/board-overview.png) <!-- TODO: aggiungere screenshot/gif -->

## Funzionalità principali

- **Visualizzazione a lavagna**: ogni task diventa un nodo trascinabile.
- **Posizioni e connessioni persistenti** salvate in file `*.vtasks.json` accanto alle note.
- **Relazioni tra task** (dipendenza, sotto-attività, sequenza) modificabili dal menu contestuale.
- **Raggruppamento** di più task in box comprimibili tramite selezione rettangolare.
- **Minimappa** per orientarsi rapidamente.
- **Pan e zoom fluidi** con mouse e scorciatoie da tastiera.
- **Colorazione automatica** dei nodi basata su tag o metadati.
- **Personalizzazioni** attraverso un pannello impostazioni dedicato.

<!-- TODO: aggiungere GIF dimostrative per ciascuna funzionalità -->

## Installazione

### Dalla community plugin (quando disponibile)
1. In Obsidian vai su **Settings → Community plugins**.
2. Disattiva la *safe mode* se richiesto.
3. Cerca **MindTask** nell'elenco e installa il plugin.
4. Attivalo per iniziare a usarlo.

### Installazione manuale

1. Clona o scarica questo repository.
2. Esegui `npm install` e `npm run build`.
3. Copia `manifest.json`, `main.js` e `styles.css` dalla cartella `dist/` nella directory dei plugin di Obsidian.
4. Riavvia Obsidian e abilita MindTask dalle impostazioni.

![Installazione](docs/img/install.gif) <!-- TODO: inserire gif di installazione -->

## Utilizzo

1. Lancia il comando **MindTask: Apri board** dal Command Palette.
2. Muovi i nodi per organizzare le attività con il mouse.
3. Clic destro su un nodo o su un bordo per accedere al menu contestuale.
4. Seleziona più task trascinando un rettangolo e raggruppali in un box comprimibile.

### Navigazione

- **Pan**: trascina con il pulsante centrale oppure `Ctrl` + trascinamento.
- **Zoom**: `Ctrl` + rotellina o tasti `+`/`-`.
- **Minimappa**: clicca o trascina all'interno per spostarti rapidamente.

### Relazioni tra task

Le relazioni sono memorizzate tramite campi Dataview inline che fanno riferimento all'ID del task di destinazione:

```markdown
[dependsOn:: id]   # il task corrente dipende da un altro
[subtaskOf:: id]   # il task corrente è una sotto-attività
[after:: id]       # il task corrente deve seguire un altro
```

![Relazioni tra task](docs/img/links.png) <!-- TODO: immagine relazioni -->

## Impostazioni

- **Identificatori dei task**:
  - `^id` come anchor di blocco (predefinito).
  - `[id:: id]` come campo inline.
- **Percorso board**: scegli dove salvare il file `.vtasks.json`; le cartelle mancanti vengono create automaticamente.
- **Colori e etichette**: associa un colore a tag o metadati per evidenziare automaticamente i nodi.

![Impostazioni](docs/img/settings.png) <!-- TODO: screenshot impostazioni -->

## Sviluppo

Per contribuire:

```bash
npm install
npm run build
```

Struttura del codice:

- `src/parser.ts` – analizza i file e garantisce ID univoci.
- `src/boardStore.ts` – salva e carica lo stato della lavagna.
- `src/controller.ts` – azioni di alto livello come creazione di task e connessioni.
- `src/view.ts` – rendering SVG della lavagna.
- `src/main.ts` – entry point del plugin.

![Workflow di sviluppo](docs/img/dev.gif) <!-- TODO: gif development -->

## Stato del progetto

MindTask è ancora in fase iniziale; aspettati cambiamenti e possibili bug. Ogni contributo o suggerimento è benvenuto.

## Licenza

Distribuito sotto licenza MIT. Vedi [LICENSE](LICENSE) per maggiori dettagli.
