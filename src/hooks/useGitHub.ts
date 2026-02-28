import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuthStore, type GitHubUserData } from "@/store/authStore";

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  updated_at: string;
  stargazers_count: number;
  language: string | null;
  clone_url: string;
}

/** Fetches the authenticated GitHub user and syncs into authStore */
export function useGitHubUser() {
  const token = useAuthStore((s) => s.githubToken);
  const setGitHubUser = useAuthStore((s) => s.setGitHubUser);

  const query = useQuery<GitHubUserData>({
    queryKey: ["github", "user", token],
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });
      if (!res.ok) throw new Error("Failed to fetch GitHub user");
      return res.json();
    },
  });

  useEffect(() => {
    if (query.data) setGitHubUser(query.data);
  }, [query.data, setGitHubUser]);

  return query;
}

/** Fetches the authenticated user's GitHub repos, sorted by recently updated */
export function useGitHubRepos() {
  const token = useAuthStore((s) => s.githubToken);

  return useQuery<GitHubRepo[]>({
    queryKey: ["github", "repos", token],
    enabled: !!token,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(
        "https://api.github.com/user/repos?sort=updated&per_page=100",
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
          },
        }
      );
      if (!res.ok) throw new Error("Failed to fetch GitHub repos");
      return res.json();
    },
  });
}

/** Call after disconnecting to clear all GitHub cache */
export function useInvalidateGitHubCache() {
  const client = useQueryClient();
  return () => client.removeQueries({ queryKey: ["github"] });
}
