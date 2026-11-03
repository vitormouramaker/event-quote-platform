import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usersApi } from "../../../services/api";
import type { UserWriteDto } from "../../../services/api";
import { usersQueryKey } from "../queries/useUsersQuery";

type UpdateUserMutationVars = {
  id: string;
  data: UserWriteDto;
};

export function useCreateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UserWriteDto) => {
      const res = await usersApi.create(data);
      if (!res.ok) {
        throw new Error(res.message || "Erro ao criar usuario");
      }
      return res;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: usersQueryKey });
      toast.success("Usuario criado com sucesso!");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao criar usuario");
    },
  });
}

export function useUpdateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdateUserMutationVars) => {
      const res = await usersApi.update(id, data);
      if (!res.ok) {
        throw new Error(res.message || "Erro ao atualizar usuario");
      }
      return res;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: usersQueryKey });
      toast.success("Usuario atualizado!");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar usuario");
    },
  });
}

export function useDeleteUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await usersApi.remove(id);
      if (!res.ok) {
        throw new Error(res.message || "Erro ao excluir usuario");
      }
      return res;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: usersQueryKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir usuario");
    },
  });
}
