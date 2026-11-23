import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button — identidade Cone Sul sobre os tokens do produto.
 * Variants:
 *   - primary (default): CTA — preenchido com `accent`, sombra colorida, sobe no hover
 *   - secondary / outline: contorno que INVERTE no hover (preenche com `accent`, texto branco)
 *   - ghost: transparente, para barra de ferramentas e ícone
 *   - chip: pílula discreta (paginação, "atualizar lista", "ver todos")
 *   - danger: discreto; no hover avisa em vermelho (sair, limpar)
 *   - destructive: preenchido em vermelho (confirmação de exclusão)
 *   - link: só texto, sublinhado dourado
 *   - default: alias de primary (compat shadcn)
 *
 * A cor é SEMPRE o token `accent` — nunca o hex: a marca da instalação troca a
 * rampa em runtime. Ícone interno que deve reagir (seta que desliza, refresh que
 * gira) usa `group-hover:` — o `group` já vem na base.
 */
const buttonVariants = cva(
  [
    "group inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-xl font-black uppercase tracking-widest",
    "transition-all duration-200 ease-out",
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-300",
    "active:scale-95",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-foreground shadow-lg shadow-accent/20 hover:bg-accent-hover hover:scale-[1.02] hover:shadow-xl hover:shadow-accent/25",
        default:
          "bg-accent text-accent-foreground shadow-lg shadow-accent/20 hover:bg-accent-hover hover:scale-[1.02] hover:shadow-xl hover:shadow-accent/25",
        secondary:
          "border border-accent/15 bg-accent/5 text-accent hover:border-accent hover:bg-accent hover:text-accent-foreground hover:shadow-md",
        outline:
          "border border-border-strong bg-surface text-text hover:border-accent hover:bg-accent hover:text-accent-foreground hover:shadow-md",
        ghost:
          "bg-transparent text-text hover:bg-accent-soft hover:text-accent",
        chip:
          "rounded-full border border-border bg-bg text-text-muted hover:border-border-strong hover:text-accent hover:shadow-sm",
        danger:
          "border border-transparent bg-transparent text-text-muted hover:border-error/30 hover:bg-error-bg hover:text-error-fg",
        destructive:
          "bg-error text-white shadow-lg shadow-error/20 hover:brightness-95",
        link:
          "h-auto rounded-none bg-transparent p-0 tracking-[0.2em] text-accent underline decoration-gold/30 underline-offset-4 hover:text-gold-ink hover:decoration-gold active:scale-100",
      },
      // Alturas de toque: abaixo de `lg` (mesmo corte que o resto da casca
      // usa pra decidir "é celular/tablet, é mouse") toda variante bate os
      // 44px recomendados pra alvo de toque; de `lg:` pra cima, onde quem
      // aciona é cursor, volta pro tamanho compacto original — mudar isso
      // globalmente pro app inteiro em telas grandes infla a densidade sem
      // necessidade nenhuma. `lg` já nascia com 44px e não precisou mudar.
      size: {
        sm: "h-11 px-3 text-[11px] lg:h-8",
        default: "h-11 px-4 text-xs lg:h-9",
        md: "h-11 px-4 text-xs lg:h-9",
        lg: "h-11 px-6 text-sm",
        icon: "h-11 w-11 lg:h-9 lg:w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
