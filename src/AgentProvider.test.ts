import { describe, expect, it } from "vitest";
import { claudeCodeProvider, getAgentProvider } from "./AgentProvider.js";

describe("claudeCodeProvider", () => {
  it("has name 'claude-code'", () => {
    expect(claudeCodeProvider.name).toBe("claude-code");
  });

  it("envManifest varies by execution mode", () => {
    const dockerEnv = claudeCodeProvider.envManifest("docker");
    const localEnv = claudeCodeProvider.envManifest("local");

    expect(dockerEnv).not.toHaveProperty("CLAUDE_CODE_OAUTH_TOKEN");
    expect(dockerEnv).toHaveProperty("ANTHROPIC_API_KEY");
    expect(dockerEnv).toHaveProperty("GH_TOKEN");

    expect(localEnv).not.toHaveProperty("CLAUDE_CODE_OAUTH_TOKEN");
    expect(localEnv).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(localEnv).toHaveProperty("GH_TOKEN");
  });

  it("has a non-empty dockerfileTemplate", () => {
    expect(claudeCodeProvider.dockerfileTemplate).toContain("FROM");
    expect(claudeCodeProvider.dockerfileTemplate).toContain("claude");
  });
});

describe("getAgentProvider", () => {
  it("returns claude-code provider for 'claude-code'", () => {
    const provider = getAgentProvider("claude-code");
    expect(provider.name).toBe("claude-code");
  });

  it("throws for unknown agent name", () => {
    expect(() => getAgentProvider("unknown-agent")).toThrow(/unknown-agent/);
  });
});
