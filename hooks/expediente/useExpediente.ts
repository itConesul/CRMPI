"use client";
import { useQuery } from "@tanstack/react-query";

import { useActiveOrg } from "@/hooks/auth/AuthProvider";
import { apiClient } from "@/lib/api/client";
import type { ExpedienteDaApi } from "@/lib/expediente/descrever";

/**
 * O expediente da organização e o estado avaliado pelo SERVIDOR agora (PRD-01 / #67).
 *
 * Fonte única da faixa do shell e da página "fora de expediente": quem decide se está dentro é o
 * servidor, pela mesma função pura que barra a ação — o navegador não recalcula, então a tela nunca
 * diverge do `403`. O poll de 1 min faz a faixa aparecer e sumir sozinha na virada do horário.
 */
export function useExpediente() {
  return useQuery({
    queryKey: ["expediente"],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ExpedienteDaApi }>("/api/v1/settings/expediente");
      return res.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * A AÇÃO está barrada para quem está logado? Só o `agent`, só fora do expediente: `admin` e
 * `manager` nunca são barrados, e quem não tem expediente configurado também não.
 *
 * Enquanto a leitura não chega (ou falha), `barrado` é `false` — a tela nunca tranca ninguém por não
 * saber. O servidor segue sendo quem recusa de verdade.
 */
export function useExpedienteBarra() {
  const papel = useActiveOrg()?.role;
  const { data, isLoading } = useExpediente();
  const barrado = papel === "agent" && !!data && data.restringe && !data.dentro;
  return { barrado, data, isLoading };
}
