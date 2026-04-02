import "./App.css";

function App() {
  return (
    <main
      aria-label="Application shell"
      className="relative min-h-screen overflow-hidden bg-app-base font-sans text-app-foreground antialiased"
      data-theme="railway-dark"
    >
      <div
        aria-label="Top window drag region"
        className="absolute inset-x-0 top-0 z-10 h-12 bg-transparent"
        data-tauri-drag-region
      />

      <div className="flex min-h-screen bg-app-base">
        <aside
          aria-label="Workspace sidebar"
          className="w-72 shrink-0 border-r border-app-border bg-app-sidebar"
        />

        <section
          aria-label="Workspace panel"
          className="flex min-h-screen flex-1 flex-col bg-app-canvas"
        >
          <div
            aria-label="Workspace viewport"
            className="flex-1 bg-app-elevated"
          />
        </section>
      </div>
    </main>
  );
}

export default App;
