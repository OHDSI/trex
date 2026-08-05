import { assertEquals } from "jsr:@std/assert";
import { isRefreshTokenExpired, refreshTokenTtlDays } from "./refresh-token-ttl.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

Deno.test("a fresh refresh token is not expired", () => {
  assertEquals(isRefreshTokenExpired(new Date(NOW - 1 * DAY), NOW, 30), false);
});

Deno.test("a refresh token past its TTL is expired", () => {
  assertEquals(isRefreshTokenExpired(new Date(NOW - 31 * DAY), NOW, 30), true);
});

Deno.test("boundary: exactly at TTL is not yet expired, just over is", () => {
  assertEquals(isRefreshTokenExpired(new Date(NOW - 30 * DAY), NOW, 30), false);
  assertEquals(isRefreshTokenExpired(new Date(NOW - 30 * DAY - 1), NOW, 30), true);
});

Deno.test("accepts string and epoch-ms timestamps", () => {
  assertEquals(isRefreshTokenExpired(new Date(NOW - 1 * DAY).toISOString(), NOW, 30), false);
  assertEquals(isRefreshTokenExpired(NOW - 40 * DAY, NOW, 30), true);
});

Deno.test("fails closed on an unparseable timestamp", () => {
  assertEquals(isRefreshTokenExpired("not-a-date", NOW, 30), true);
});

Deno.test("refreshTokenTtlDays defaults to 30 and honors a valid env override", () => {
  Deno.env.delete("REFRESH_TOKEN_TTL_DAYS");
  assertEquals(refreshTokenTtlDays(), 30);
  Deno.env.set("REFRESH_TOKEN_TTL_DAYS", "7");
  assertEquals(refreshTokenTtlDays(), 7);
  Deno.env.set("REFRESH_TOKEN_TTL_DAYS", "garbage");
  assertEquals(refreshTokenTtlDays(), 30);
  Deno.env.delete("REFRESH_TOKEN_TTL_DAYS");
});
