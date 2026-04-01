import { Effect, Layer } from "effect";
import { FileSystem } from "@effect/platform";
import { NodeFileSystem } from "@effect/platform-node";
import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname } from "node:path";
import {
  AgentError,
  CopyError,
  ExecError,
  TimeoutError,
  type WorktreeError,
} from "./errors.js";
import {
  Sandbox,
  SandboxFactory,
  type SandboxInfo,
  type SandboxService,
  type WithSandboxResult,
  WorktreeSandboxConfig,
} from "./SandboxFactory.js";
import * as WorktreeManager from "./WorktreeManager.js";
import { copyToSandbox } from "./CopyToSandbox.js";
import { Display } from "./Display.js";

const makeLocalSandbox = (): Effect.Effect<
  SandboxService,
  never,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return {
      exec: (command, options) =>
        Effect.async((resume) => {
          execFile(
            "sh",
            ["-c", command],
            {
              cwd: options?.cwd,
              env: process.env,
              maxBuffer: 10 * 1024 * 1024,
            },
            (error, stdout, stderr) => {
              if (error && error.code === undefined) {
                resume(
                  Effect.fail(
                    new ExecError({
                      command,
                      message: `local exec failed: ${error.message}`,
                    }),
                  ),
                );
              } else {
                resume(
                  Effect.succeed({
                    stdout: stdout.toString(),
                    stderr: stderr.toString(),
                    exitCode: typeof error?.code === "number" ? error.code : 0,
                  }),
                );
              }
            },
          );
        }),

      execStreaming: (command, onStdoutLine, options) =>
        Effect.async((resume) => {
          const proc = spawn("sh", ["-c", command], {
            cwd: options?.cwd,
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
          });

          const stdoutChunks: string[] = [];
          const stderrChunks: string[] = [];
          const rl = createInterface({ input: proc.stdout! });

          rl.on("line", (line) => {
            stdoutChunks.push(line);
            onStdoutLine(line);
          });

          proc.stderr!.on("data", (chunk: Buffer) => {
            stderrChunks.push(chunk.toString());
          });

          proc.on("error", (error) => {
            resume(
              Effect.fail(
                new ExecError({
                  command,
                  message: `local exec streaming failed: ${error.message}`,
                }),
              ),
            );
          });

          proc.on("close", (code) => {
            resume(
              Effect.succeed({
                stdout: stdoutChunks.join("\n"),
                stderr: stderrChunks.join(""),
                exitCode: code ?? 0,
              }),
            );
          });
        }),

      copyIn: (hostPath, sandboxPath) =>
        Effect.gen(function* () {
          yield* fs
            .makeDirectory(dirname(sandboxPath), { recursive: true })
            .pipe(
              Effect.mapError(
                (error) =>
                  new CopyError({
                    message: `Failed to create dir ${dirname(sandboxPath)}: ${error}`,
                  }),
              ),
            );
          yield* fs.copyFile(hostPath, sandboxPath).pipe(
            Effect.mapError(
              (error) =>
                new CopyError({
                  message: `Failed to copy ${hostPath} -> ${sandboxPath}: ${error}`,
                }),
            ),
          );
        }),

      copyOut: (sandboxPath, hostPath) =>
        Effect.gen(function* () {
          yield* fs.makeDirectory(dirname(hostPath), { recursive: true }).pipe(
            Effect.mapError(
              (error) =>
                new CopyError({
                  message: `Failed to create host dir ${dirname(hostPath)}: ${error}`,
                }),
            ),
          );
          yield* fs.copyFile(sandboxPath, hostPath).pipe(
            Effect.mapError(
              (error) =>
                new CopyError({
                  message: `Failed to copy ${sandboxPath} -> ${hostPath}: ${error}`,
                }),
            ),
          );
        }),
    };
  });

const makeLocalSandboxLayer = (): Layer.Layer<Sandbox> =>
  Layer.effect(Sandbox, makeLocalSandbox()).pipe(
    Layer.provide(NodeFileSystem.layer),
  );

export const WorktreeLocalSandboxFactory = {
  layer: Layer.effect(
    SandboxFactory as any,
    Effect.gen(function* () {
      const {
        hostRepoDir,
        branch,
        copyToSandbox: copyPaths,
        agentName,
      } = yield* WorktreeSandboxConfig;
      const fileSystem = yield* FileSystem.FileSystem;
      const display = yield* Display;

      return {
        withSandbox: <A, E, R>(
          makeEffect: (info: SandboxInfo) => Effect.Effect<A, E, R | Sandbox>,
        ) => {
          let preservedWorktreePath: string | undefined;

          const acquire = WorktreeManager.pruneStale(hostRepoDir)
            .pipe(
              Effect.catchAll((e) =>
                Effect.sync(() => {
                  console.error(
                    "[sandcastle-local] Warning: failed to prune stale worktrees:",
                    e.message,
                  );
                }),
              ),
            )
            .pipe(
              Effect.andThen(
                branch
                  ? WorktreeManager.create(hostRepoDir, { branch })
                  : WorktreeManager.create(hostRepoDir, { agentName }),
              ),
            )
            .pipe(Effect.provideService(FileSystem.FileSystem, fileSystem))
            .pipe(
              Effect.flatMap((worktreeInfo) =>
                (copyPaths && copyPaths.length > 0
                  ? display.spinner(
                      "Copying to local worktree",
                      copyToSandbox(copyPaths, hostRepoDir, worktreeInfo.path),
                    )
                  : Effect.succeed(undefined)
                ).pipe(Effect.map(() => worktreeInfo)),
              ),
            );

          return Effect.acquireUseRelease(
            acquire,
            (worktreeInfo) =>
              makeEffect({ hostWorktreePath: worktreeInfo.path }).pipe(
                Effect.provide(makeLocalSandboxLayer()),
              ),
            (worktreeInfo) =>
              WorktreeManager.hasUncommittedChanges(worktreeInfo.path).pipe(
                Effect.catchAll(() => Effect.succeed(false)),
                Effect.flatMap((isDirty) => {
                  if (isDirty) {
                    preservedWorktreePath = worktreeInfo.path;
                    console.error(
                      `\nWorktree preserved at ${worktreeInfo.path}\n  To review: cd ${worktreeInfo.path}\n  To clean up: git worktree remove --force ${worktreeInfo.path}`,
                    );
                    return Effect.void;
                  }
                  return WorktreeManager.remove(worktreeInfo.path);
                }),
                Effect.orDie,
              ),
          ).pipe(
            Effect.map(
              (value) =>
                ({ value, preservedWorktreePath }) as WithSandboxResult<A>,
            ),
            Effect.mapError((e: E | WorktreeError) => {
              const path = preservedWorktreePath;
              if (path !== undefined) {
                if (e instanceof TimeoutError) {
                  return new TimeoutError({
                    message: e.message,
                    idleTimeoutSeconds: e.idleTimeoutSeconds,
                    preservedWorktreePath: path,
                  }) as unknown as E | WorktreeError;
                }
                if (e instanceof AgentError) {
                  return new AgentError({
                    message: e.message,
                    preservedWorktreePath: path,
                  }) as unknown as E | WorktreeError;
                }
              }
              return e;
            }),
          );
        },
      };
    }),
  ),
};
