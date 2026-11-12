import { toast } from "sonner";

import { emitNotification } from "./emit";
import type { NotifyKind } from "./kinds";
import { canalLigado, type NotifyCategory } from "./prefs";

export interface EntregarAvisoInput {
  category: NotifyCategory;
  kind: NotifyKind;
  title: string;
  body: string;
  tag?: string;
  href?: string;
  icon?: string;
  /**
   * Identifica o toast: um aviso novo com o MESMO id substitui o anterior em vez
   * de empilhar. É o que faz "3 novas mensagens" de uma conversa ocupar um lugar
   * só na tela.
   */
  id?: string;
}

export function entregarAviso(input: EntregarAvisoInput): void {
  if (canalLigado(input.category, "in_app")) {
    toast(input.title, { description: input.body, ...(input.id ? { id: input.id } : {}) });
  }
  if (canalLigado(input.category, "push")) {
    emitNotification({
      kind: input.kind,
      title: input.title,
      body: input.body,
      tag: input.tag,
      href: input.href,
      icon: input.icon,
      force: true,
    });
  }
}
