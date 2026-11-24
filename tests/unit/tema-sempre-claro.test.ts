/**
 * O PRODUTO É SEMPRE CLARO, E NÃO HÁ OPÇÃO DE TROCAR (decisão do dono).
 *
 * Guarda o que um retorno silencioso desfaria: o script anti-flash que volta a ler
 * `prefers-color-scheme`, o botão de tema que volta ao menu, o toast que volta a
 * seguir o sistema, a barra do navegador que volta a ter versão escura. Nenhum
 * deles quebra build nem teste de tipo — a tela só aparece escura em quem tem o
 * sistema operacional escuro.
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("tema sempre claro", () => {
  it("o script anti-flash fixa o claro e não lê preferência nenhuma", () => {
    const layout = ler("app/layout.tsx");
    const script = /const THEME_INIT_SCRIPT = `([^`]*)`/.exec(layout)?.[1];
    expect(script, "não achei THEME_INIT_SCRIPT — o teste ficou cego").toBeTruthy();
    expect(script).toContain("setAttribute('data-theme','light')");
    expect(script).not.toMatch(/prefers-color-scheme|matchMedia|getItem/);
  });

  it("o provider não persiste nem segue o sistema", () => {
    const bruto = ler("lib/theme.tsx");
    expect(bruto.length).toBeGreaterThan(200);
    // A régua é o CÓDIGO: o comentário do arquivo explica o que foi removido, e
    // nomeia justamente os termos que o teste proíbe.
    const fonte = bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(fonte).not.toMatch(/prefers-color-scheme|matchMedia|setItem|getItem/);
    expect(fonte).toContain('React.useState<Theme>("light")');
  });

  it("não existe botão de tema no menu do usuário", () => {
    expect(existsSync(join(process.cwd(), "components/theme/theme-toggle.tsx"))).toBe(false);
    expect(ler("components/shell/UserMenu.tsx")).not.toMatch(/ThemeToggle|theme-toggle/);
  });

  it("o toast não segue o sistema", () => {
    const fonte = ler("components/ui/sonner.tsx");
    expect(fonte).toContain('theme="light"');
    expect(fonte).not.toMatch(/useTheme|system/);
  });
});
