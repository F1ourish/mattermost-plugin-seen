import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName, selectProfiles } from "./profiles.ts";
const id = "a".repeat(26);
const profile = {
  first_name: "  Иван ",
  last_name: " Петров ",
  nickname: " Ваня ",
  username: " ipetrov ",
};
test("all configured name display modes and fallback order", () => {
  assert.equal(displayName(id, profile, "full_name"), "Иван Петров");
  assert.equal(displayName(id, profile, "nickname_full_name"), "Ваня");
  assert.equal(displayName(id, profile, "username"), "ipetrov");
  assert.equal(
    displayName(id, { ...profile, nickname: " " }, "nickname_full_name"),
    "Иван Петров",
  );
  assert.equal(
    displayName(id, { ...profile, username: "" }, "username"),
    "Иван Петров",
  );
  assert.equal(
    displayName(id, { nickname: "Ваня", username: "ipetrov" }, "full_name"),
    "Ваня",
  );
  assert.equal(
    displayName(id, { username: "ipetrov" }, "full_name"),
    "ipetrov",
  );
  assert.equal(
    displayName(
      id,
      { first_name: " ", last_name: "\t", nickname: "", username: "" },
      "full_name",
    ),
    id,
  );
  assert.equal(displayName(id, undefined, "full_name"), id);
  assert.equal(displayName(id, { last_name: "Петров" }, "full_name"), "Петров");
  assert.equal(displayName(id, profile, "unknown"), "Иван Петров");
  assert.equal(displayName(id, profile), "Иван Петров");
});
test("profile response retains only requested users and display fields", () => {
  const result = selectProfiles(
    [
      { id, ...profile, delete_at: 0, email: "secret", roles: "system_admin" },
      { id: "b".repeat(26), first_name: "Other" },
      null,
    ],
    [id],
  );
  assert.deepEqual(Object.keys(result), [id]);
  assert.deepEqual(Object.keys(result[id]).sort(), [
    "delete_at",
    "first_name",
    "id",
    "last_name",
    "nickname",
    "username",
  ]);
  assert.equal(result[id].first_name, "Иван");
  assert.deepEqual(selectProfiles({ error: "denied" }, [id]), {});
});
