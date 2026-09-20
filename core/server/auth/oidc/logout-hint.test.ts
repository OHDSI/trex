// RP-initiated logout with an id_token_hint fails on a local stack, and the
// failure used to be invisible: the "Confirm logout" page a rejected hint
// produces is byte-identical to the one no hint at all produces. These pin that
// it is no longer invisible, and that the diagnosis is the right one — trex
// says "the token is genuine, the provider's own JWKS fetch is what failed",
// not "your certificate is wrong", which was the first guess and was wrong.
import { assertEquals, assertNotEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  annotateLogoutConfirmation,
  hintFromRequest,
  logoutHintDiagnosis,
  logoutHintWasRejected,
} from "./logout-hint.ts";

// The provider's own confirmation page, copied from
// dist/authorize-riRRCSbC.mjs:401 — a literal, so this test fails if the markup
// this anchors on ever moves, which is exactly when the banner would silently
// stop appearing.
const CONFIRM_PAGE = `<html><body><main><h1>Confirm logout</h1><p>Do you want to log out of this account?</p>` +
  `<form method="post" data-oidc-logout-confirmation action="/trex/oidc/oauth2/end-session/confirm">` +
  `<button type="submit" name="action" value="confirm">Confirm logout</button></form></main></body></html>`;

const SUCCESS_PAGE = `<html><body><main><h1>Signed out</h1></main></body></html>`;

Deno.test("a rejected hint is recognised on both of the endpoint's answers", () => {
  // The browser answer: 200 HTML, told apart from the success page ONLY by the
  // confirmation cookie. This is the case that was invisible.
  assertEquals(
    logoutHintWasRejected(200, ["d2e.oauth_logout_confirmation=abc; Path=/; HttpOnly"]),
    true,
  );
  // The API answer: 401 The id_token_hint is invalid.
  assertEquals(logoutHintWasRejected(401, []), true);
});

Deno.test("a hint that WORKED is not reported as rejected", () => {
  // A verified hint deletes the session and redirects to the registered
  // post-logout URI (dist/authorize-riRRCSbC.mjs:666-675) — no confirmation
  // cookie, no 401. Reporting that as a failure would make the diagnostic
  // noise, and noise is what gets ignored.
  assertEquals(logoutHintWasRejected(302, ["__Secure-better-auth.session_token=; Max-Age=0"]), false);
  assertEquals(logoutHintWasRejected(200, []), false, "the success page");
  assertEquals(logoutHintWasRejected(200, ["sb-access-token=; Max-Age=0"]), false);
});

Deno.test("the diagnosis names the JWKS fetch, not the certificate", () => {
  // The cause the rehearsal established, and the one the first guess got wrong.
  const valid = logoutHintDiagnosis("signature-valid");
  assertStringIncludes(valid, "genuine");
  assertStringIncludes(valid, "JWKS fetch");
  assertStringIncludes(valid, "authorize-riRRCSbC.mjs:547");
  // And it must NOT blame the relying party, which is what the 401 alone does.
  assertEquals(valid.includes("bad token"), true, "it says explicitly that it is not a bad token");

  // The other verdict has to point somewhere else entirely, or the diagnostic
  // is decoration.
  const invalid = logoutHintDiagnosis("signature-invalid");
  assertStringIncludes(invalid, "did not verify against trex's own key set");
  assertNotEquals(invalid, valid);
  assertEquals(invalid.includes("547"), false);
});

Deno.test("the banner lands on the confirmation page and nowhere else", () => {
  const annotated = annotateLogoutConfirmation(CONFIRM_PAGE, "signature-valid");
  assertStringIncludes(annotated, "could not be completed automatically");
  assertStringIncludes(annotated, 'data-trex-logout-hint="signature-valid"');
  // The Confirm button survives: taking it away to make a point would stop the
  // user being able to log out at all.
  assertStringIncludes(annotated, 'value="confirm"');
  // And the page is still a page.
  assertStringIncludes(annotated, "</main></body></html>");

  // Not on the success page, which has no confirmation form.
  assertEquals(annotateLogoutConfirmation(SUCCESS_PAGE, "signature-valid"), SUCCESS_PAGE);
  // Not on an error document either.
  assertEquals(annotateLogoutConfirmation("{\"error\":\"invalid_token\"}", "signature-valid"), "{\"error\":\"invalid_token\"}");
});

Deno.test("the banner is a no-op rather than a corruption if the markup moves", () => {
  // A missing banner is a smaller problem than a broken page.
  const noMain = `<html><body><form data-oidc-logout-confirmation></form></body></html>`;
  assertEquals(annotateLogoutConfirmation(noMain, "signature-valid"), noMain);
});

Deno.test("the hint is found wherever the endpoint itself looks for it", () => {
  // Query and body both, because rpInitiatedLogoutEndpoint merges them
  // (dist/authorize-riRRCSbC.mjs:635-640). Reading only the query would report
  // "no hint" for every POST logout and the diagnostic would never fire.
  assertEquals(hintFromRequest("/trex/oidc/oauth2/end-session?id_token_hint=abc.def.ghi", undefined), "abc.def.ghi");
  assertEquals(
    hintFromRequest("/trex/oidc/oauth2/end-session", Buffer.from("id_token_hint=abc.def.ghi&state=s")),
    "abc.def.ghi",
  );
  assertEquals(hintFromRequest("/trex/oidc/oauth2/end-session", undefined), null);
  assertEquals(hintFromRequest("/trex/oidc/oauth2/end-session?client_id=x", Buffer.from("state=s")), null);
  assertEquals(hintFromRequest("/trex/oidc/oauth2/end-session?id_token_hint=", undefined), null);
});
