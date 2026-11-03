import { useQuery } from "@tanstack/react-query";
import { usersApi } from "../../../services/api";
import { mapUser, type AppUser } from "../../../store/userStore";

export const usersQueryKey = ["users"] as const;

async function fetchUsersQuery(): Promise<AppUser[]> {
  const res = await usersApi.getAll();
  if (!res.ok) {
    throw new Error(res.message || "Erro ao carregar usuários");
  }
  return (res.data ?? []).map(mapUser);
}

export function useUsersQuery() {
  return useQuery({
    queryKey: usersQueryKey,
    queryFn: fetchUsersQuery,
  });
}
