"use client";

import * as React from "react";

/**
 * O PRODUTO É SEMPRE CLARO — decisão do dono, sem opção de trocar.
 *
 * Este provider não lê `localStorage` nem `prefers-color-scheme`: o tema é `light`
 * e pronto. O que sobrou do mecanismo antigo existe por um único consumidor, o kit
 * visual (`/vitrine-agenda`), que prova as cores nos dois temas: lá `setTheme` troca
 * o tema SÓ NA MEMÓRIA daquela aba, e recarregar volta ao claro. Nenhuma tela do
 * produto chama `setTheme`.
 *
 * `STORAGE_KEY` continua aqui só para APAGAR a escolha que usuários antigos deixaram
 * no navegador — sem isso, quem tinha ficado no escuro não teria como saber por que o
 * valor guardado deixou de valer. (O script anti-flash do `app/layout.tsx` faz o mesmo
 * antes do primeiro paint.)
 */
export type Theme = "light" | "dark";
export type ResolvedTheme = Theme;

const STORAGE_KEY = "deskcomm-theme";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  /** Só na memória, e só o kit visual usa. Não persiste. */
  setTheme: (theme: Theme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>("light");

  React.useEffect(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage indisponível (modo privado, sandbox) — nada a apagar.
    }
  }, []);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: theme, setTheme }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within <ThemeProvider>");
  }
  return ctx;
}
