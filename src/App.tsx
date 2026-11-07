import { ThemeProvider } from "@/providers/theme-provider";
import "./App.css";

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <main className="dark w-full min-h-dvh">
        <section>
        </section>
      </main>
    </ThemeProvider>
  );
}

export default App;
