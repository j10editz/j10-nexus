import {describe,it,expect} from "vitest";
import {answerPublicQuestion} from "../../lib/marketing/public-faq";
describe("public FAQ boundaries",()=>{
 it("answers the actual question",()=>{expect(answerPublicQuestion("pricing")).toContain("$19");expect(answerPublicQuestion("trial")).toContain("approve Outcome Onboarding");expect(answerPublicQuestion("trial")).not.toEqual(answerPublicQuestion("pricing"));});
 it("never pretends to operate an account",()=>{expect(answerPublicQuestion("rotate my API key")).toContain("cannot access accounts");expect(answerPublicQuestion("book an appointment")).toContain("does not create a real appointment");});
 it("does not invent answers to unsupported questions",()=>{expect(answerPublicQuestion("what is my revenue today?")).toContain("cannot access your workspace");});
});
