import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useGetProfile, useUpsertProfile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  COLLEGE_OPTIONS,
  STUDENT_TYPE_OPTIONS,
  TERM_OPTIONS,
  termLabel,
} from "@/lib/api";
import { GraduationCap, ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Who you are", subtitle: "Basics about you and your program" },
  { title: "Where you stand", subtitle: "Units, GPA, and academic history" },
  { title: "Where you're heading", subtitle: "Current term and graduation target" },
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: existing } = useGetProfile();
  const upsert = useUpsertProfile();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [studentType, setStudentType] = useState("first_year");
  const [college, setCollege] = useState(COLLEGE_OPTIONS[1]);
  const [major, setMajor] = useState("");
  const [secondMajor, setSecondMajor] = useState("");
  const [minor, setMinor] = useState("");
  const [startTerm, setStartTerm] = useState<string>("fall");
  const [startYear, setStartYear] = useState<number>(2025);
  const [expectedGradTerm, setExpectedGradTerm] = useState<string>("spring");
  const [expectedGradYear, setExpectedGradYear] = useState<number>(2029);
  const [unitsCompletedAtSCU, setUnitsCompletedAtSCU] = useState<number>(0);
  const [unitsTransferredIn, setUnitsTransferredIn] = useState<number>(0);
  const [cumulativeGpa, setCumulativeGpa] = useState<string>("");
  const [majorGpa, setMajorGpa] = useState<string>("");
  const [completedCourses, setCompletedCourses] = useState<string>("");
  const [priorityRegistration, setPriorityRegistration] = useState<boolean>(false);
  const [currentTerm, setCurrentTerm] = useState<string>("fall");
  const [currentYear, setCurrentYear] = useState<number>(2025);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setStudentType(existing.studentType);
    setCollege(existing.college as typeof COLLEGE_OPTIONS[number]);
    setMajor(existing.major);
    setSecondMajor(existing.secondMajor ?? "");
    setMinor(existing.minor ?? "");
    setStartTerm(existing.startTerm);
    setStartYear(existing.startYear);
    setExpectedGradTerm(existing.expectedGradTerm);
    setExpectedGradYear(existing.expectedGradYear);
    setUnitsCompletedAtSCU(existing.unitsCompletedAtSCU);
    setUnitsTransferredIn(existing.unitsTransferredIn);
    setCumulativeGpa(existing.cumulativeGpa == null ? "" : String(existing.cumulativeGpa));
    setMajorGpa(existing.majorGpa == null ? "" : String(existing.majorGpa));
    setCompletedCourses((existing.completedCourseCodes ?? []).join(", "));
    setPriorityRegistration(existing.priorityRegistration);
    setCurrentTerm(existing.currentTerm);
    setCurrentYear(existing.currentYear);
  }, [existing]);

  const onSubmit = async () => {
    await upsert.mutateAsync({
      data: {
        name: name.trim(),
        studentType: studentType as "first_year" | "transfer" | "continuing",
        college,
        major: major.trim(),
        secondMajor: secondMajor.trim() || null,
        minor: minor.trim() || null,
        startTerm: startTerm as "fall" | "winter" | "spring" | "summer",
        startYear,
        expectedGradTerm: expectedGradTerm as "fall" | "winter" | "spring" | "summer",
        expectedGradYear,
        unitsCompletedAtSCU,
        unitsTransferredIn,
        cumulativeGpa: cumulativeGpa.trim() ? Number(cumulativeGpa) : null,
        majorGpa: majorGpa.trim() ? Number(majorGpa) : null,
        completedCourseCodes: completedCourses
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
        priorityRegistration,
        currentTerm: currentTerm as "fall" | "winter" | "spring" | "summer",
        currentYear,
      },
    });
    await queryClient.invalidateQueries();
    setLocation("/");
  };

  const canNext0 = name.trim().length > 0 && major.trim().length > 0;
  const canNext1 =
    !Number.isNaN(unitsCompletedAtSCU) && !Number.isNaN(unitsTransferredIn);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-serif font-bold text-xl shadow-md">
            CV
          </div>
          <div>
            <div className="font-serif font-bold text-2xl text-foreground">
              CampusVal
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" />
              Santa Clara University academic advising
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={i} className="flex-1 flex items-center gap-2">
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all",
                  i < step
                    ? "bg-primary text-primary-foreground border-primary"
                    : i === step
                      ? "bg-card text-primary border-primary"
                      : "bg-card text-muted-foreground border-border",
                )}
              >
                {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 transition-colors",
                    i < step ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </div>
          ))}
        </div>

        <Card className="p-8">
          <h2 className="font-serif text-2xl font-bold text-foreground">
            {STEPS[step]!.title}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {STEPS[step]!.subtitle}
          </p>

          <div className="mt-6 space-y-5">
            {step === 0 && (
              <>
                <Field label="Your name" required>
                  <Input
                    data-testid="input-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Bronco Buster"
                  />
                </Field>
                <Field label="Student type" required>
                  <Select value={studentType} onValueChange={setStudentType}>
                    <SelectTrigger data-testid="select-student-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STUDENT_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="College" required>
                  <Select
                    value={college}
                    onValueChange={(v) =>
                      setCollege(v as typeof COLLEGE_OPTIONS[number])
                    }
                  >
                    <SelectTrigger data-testid="select-college">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLLEGE_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Major" required>
                    <Input
                      data-testid="input-major"
                      value={major}
                      onChange={(e) => setMajor(e.target.value)}
                      placeholder="Computer Science & Engineering"
                    />
                  </Field>
                  <Field label="Second major (optional)">
                    <Input
                      data-testid="input-second-major"
                      value={secondMajor}
                      onChange={(e) => setSecondMajor(e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Minor (optional)">
                  <Input
                    data-testid="input-minor"
                    value={minor}
                    onChange={(e) => setMinor(e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Start term">
                    <Select value={startTerm} onValueChange={setStartTerm}>
                      <SelectTrigger data-testid="select-start-term">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TERM_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {termLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Start year">
                    <Input
                      data-testid="input-start-year"
                      type="number"
                      value={startYear}
                      onChange={(e) => setStartYear(Number(e.target.value))}
                    />
                  </Field>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Units completed at SCU">
                    <Input
                      data-testid="input-units-scu"
                      type="number"
                      step="0.5"
                      value={unitsCompletedAtSCU}
                      onChange={(e) =>
                        setUnitsCompletedAtSCU(Number(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Units transferred in (quarter units)">
                    <Input
                      data-testid="input-units-transfer"
                      type="number"
                      step="0.5"
                      value={unitsTransferredIn}
                      onChange={(e) =>
                        setUnitsTransferredIn(Number(e.target.value))
                      }
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Cumulative GPA (optional)">
                    <Input
                      data-testid="input-cumulative-gpa"
                      type="number"
                      step="0.001"
                      min="0"
                      max="4"
                      placeholder="e.g. 3.412"
                      value={cumulativeGpa}
                      onChange={(e) => setCumulativeGpa(e.target.value)}
                    />
                  </Field>
                  <Field label="Major GPA (optional)">
                    <Input
                      data-testid="input-major-gpa"
                      type="number"
                      step="0.001"
                      min="0"
                      max="4"
                      value={majorGpa}
                      onChange={(e) => setMajorGpa(e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Completed course codes (comma-separated)">
                  <Textarea
                    data-testid="textarea-completed-courses"
                    rows={3}
                    value={completedCourses}
                    onChange={(e) => setCompletedCourses(e.target.value)}
                    placeholder="MATH 11, MATH 12, ENGL 1A, CSEN 10"
                  />
                </Field>
                <div className="flex items-center justify-between rounded-md border border-border p-4 bg-muted/30">
                  <div>
                    <Label className="text-sm font-medium">
                      Priority registration
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Honors, athletes, OAE, ROTC, veterans. Required for unit overload.
                    </p>
                  </div>
                  <Switch
                    data-testid="switch-priority"
                    checked={priorityRegistration}
                    onCheckedChange={setPriorityRegistration}
                  />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Current term">
                    <Select value={currentTerm} onValueChange={setCurrentTerm}>
                      <SelectTrigger data-testid="select-current-term">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TERM_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {termLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Current year">
                    <Input
                      data-testid="input-current-year"
                      type="number"
                      value={currentYear}
                      onChange={(e) => setCurrentYear(Number(e.target.value))}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Expected graduation term">
                    <Select
                      value={expectedGradTerm}
                      onValueChange={setExpectedGradTerm}
                    >
                      <SelectTrigger data-testid="select-grad-term">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TERM_OPTIONS.map((t) => (
                          <SelectItem key={t} value={t}>
                            {termLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Expected graduation year">
                    <Input
                      data-testid="input-grad-year"
                      type="number"
                      value={expectedGradYear}
                      onChange={(e) =>
                        setExpectedGradYear(Number(e.target.value))
                      }
                    />
                  </Field>
                </div>
                <div className="rounded-md border border-secondary/30 bg-secondary/5 p-4">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">Almost there.</span>{" "}
                    CampusVal will personalize your dashboard, planner, and AI
                    advisor with everything you've shared. You can edit this any
                    time from Profile.
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="mt-8 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              data-testid="button-back"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={(step === 0 && !canNext0) || (step === 1 && !canNext1)}
                data-testid="button-next"
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={onSubmit}
                disabled={upsert.isPending}
                data-testid="button-finish"
              >
                {upsert.isPending ? "Saving..." : "Open my dashboard"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-primary ml-1">*</span>}
      </Label>
      {children}
    </div>
  );
}
