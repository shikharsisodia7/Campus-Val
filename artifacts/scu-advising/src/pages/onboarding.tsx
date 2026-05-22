import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetProfile,
  useUpsertProfile,
  useListCourses,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import {
  COLLEGE_OPTIONS,
  COLLEGE_CODE,
  STUDENT_TYPE_OPTIONS,
  TERM_OPTIONS,
  termLabel,
  type StudentType,
  getApiUrl,
} from "@/lib/api";
import {
  EXAM_CREDITS,
  loadStoredExams,
  saveStoredExams,
  type StoredExam,
} from "@/lib/apib";
import {
  GraduationCap,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { getCurrentSCUTerm } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useClerk } from "@clerk/react";
import { useToast } from "@/hooks/use-toast";

const TODAY = getCurrentSCUTerm();

const STEPS = [
  { title: "Who you are", subtitle: "Basics about you and your program" },
  { title: "Where you stand", subtitle: "Units, GPA, and academic history" },
  { title: "Where you're heading", subtitle: "Current term and graduation target" },
];

const NONE_VALUE = "__none__";

interface MajorOption {
  code: string;
  title: string;
  college: "SOE" | "LSB" | "CAS";
}

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const { data: existing } = useGetProfile();
  const upsert = useUpsertProfile();
  const { data: catalog = [] } = useListCourses({});

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [studentType, setStudentType] = useState<StudentType>("first_year");
  const [college, setCollege] = useState<typeof COLLEGE_OPTIONS[number]>(
    COLLEGE_OPTIONS[1],
  );
  const [major, setMajor] = useState("");
  const [secondMajor, setSecondMajor] = useState<string>(NONE_VALUE);
  const [minor, setMinor] = useState<string>(NONE_VALUE);
  const [startTerm, setStartTerm] = useState<string>("fall");
  const [startYear, setStartYear] = useState<number>(TODAY.year);
  const [expectedGradTerm, setExpectedGradTerm] = useState<string>("spring");
  const [expectedGradYear, setExpectedGradYear] = useState<number>(TODAY.year + 4);
  const [unitsCompletedAtSCU, setUnitsCompletedAtSCU] = useState<number>(0);
  const [unitsTransferredIn, setUnitsTransferredIn] = useState<number>(0);
  const [cumulativeGpa, setCumulativeGpa] = useState<string>("");
  const [majorGpa, setMajorGpa] = useState<string>("");
  const [completedCourses, setCompletedCourses] = useState<string[]>([]);
  const [storedExams, setStoredExams] = useState<StoredExam[]>([]);
  const [priorityRegistration, setPriorityRegistration] = useState<boolean>(false);
  const [currentTerm, setCurrentTerm] = useState<string>(TODAY.term);
  const [currentYear, setCurrentYear] = useState<number>(TODAY.year);

  const [majors, setMajors] = useState<MajorOption[]>([]);
  const [minors, setMinors] = useState<MajorOption[]>([]);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/graduation-paths/majors`)
      .then((r) => r.json())
      .then((j) => setMajors(j.majors || []))
      .catch(() => setMajors([]));
    fetch(`${import.meta.env.BASE_URL}api/graduation-paths/minors`)
      .then((r) => r.json())
      .then((j) => setMinors(j.minors || []))
      .catch(() => setMinors([]));
  }, []);

  useEffect(() => {
    setStoredExams(loadStoredExams());
  }, []);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setStudentType(existing.studentType as StudentType);
    setCollege(existing.college as typeof COLLEGE_OPTIONS[number]);
    setMajor(existing.major);
    setSecondMajor(existing.secondMajor && existing.secondMajor !== "" ? existing.secondMajor : NONE_VALUE);
    setMinor(existing.minor && existing.minor !== "" ? existing.minor : NONE_VALUE);
    setStartTerm(existing.startTerm);
    setStartYear(existing.startYear);
    setExpectedGradTerm(existing.expectedGradTerm);
    setExpectedGradYear(existing.expectedGradYear);
    setUnitsCompletedAtSCU(existing.unitsCompletedAtSCU);
    setUnitsTransferredIn(existing.unitsTransferredIn);
    setCumulativeGpa(existing.cumulativeGpa == null ? "" : String(existing.cumulativeGpa));
    setMajorGpa(existing.majorGpa == null ? "" : String(existing.majorGpa));
    setCompletedCourses(existing.completedCourseCodes ?? []);
    setPriorityRegistration(existing.priorityRegistration);
    setCurrentTerm(existing.currentTerm);
    setCurrentYear(existing.currentYear);
  }, [existing]);

  // Filter major dropdown by selected college's 3-letter code.
  const collegeFilteredMajors = useMemo(() => {
    const code = COLLEGE_CODE[college];
    return majors.filter((m) => m.college === code);
  }, [majors, college]);

  // Reset major selection when college changes if it doesn't fit.
  useEffect(() => {
    if (!major) return;
    const stillValid = collegeFilteredMajors.some((m) => m.code === major || m.title === major);
    if (!stillValid && collegeFilteredMajors.length > 0) {
      setMajor("");
    }
  }, [college, collegeFilteredMajors, major]);

  // ----- Field-level error messages -----
  const cumulativeGpaError = (() => {
    if (cumulativeGpa.trim().length === 0) return "Required.";
    const n = Number(cumulativeGpa);
    if (Number.isNaN(n)) return "Must be a number (e.g. 3.412).";
    if (n < 0) return "GPA can't be negative.";
    if (n > 4) return "GPA must be ≤ 4.0 on SCU's scale.";
    return null;
  })();
  const majorGpaError = (() => {
    if (majorGpa.trim().length === 0) return "Required.";
    const n = Number(majorGpa);
    if (Number.isNaN(n)) return "Must be a number (e.g. 3.500).";
    if (n < 0) return "GPA can't be negative.";
    if (n > 4) return "GPA must be ≤ 4.0 on SCU's scale.";
    return null;
  })();
  const unitsScuError = unitsCompletedAtSCU < 0 ? "Cannot be negative." : null;
  const unitsXferError = unitsTransferredIn < 0 ? "Cannot be negative." : null;
  const nameError = name.trim().length === 0 ? "Required." : null;
  const majorError = major.trim().length === 0 ? "Pick your major." : null;
  const currentYearMin = 2015;
  const currentYearMax = TODAY.year + 1;
  const startYearError =
    startYear < currentYearMin || startYear > TODAY.year + 6
      ? `Enter a 4-digit year between ${currentYearMin} and ${TODAY.year + 6}.`
      : null;
  const currentYearError =
    currentYear < currentYearMin || currentYear > currentYearMax
      ? `Enter a 4-digit year between ${currentYearMin} and ${currentYearMax}.`
      : null;
  const expectedGradYearError =
    expectedGradYear < TODAY.year || expectedGradYear > TODAY.year + 10
      ? `Enter a 4-digit year between ${TODAY.year} and ${TODAY.year + 10}.`
      : expectedGradYear < startYear
        ? "Cannot be before your start year."
        : null;

  const onSubmit = async () => {
    if (nameError || majorError || startYearError || cumulativeGpaError || majorGpaError || unitsScuError || unitsXferError || currentYearError || expectedGradYearError) {
      toast({
        title: "Please fix the highlighted fields",
        description: "Some required fields are missing or invalid. Step back through the wizard and check the red error messages.",
        variant: "destructive",
      });
      return;
    }
    saveStoredExams(storedExams);
    try {
      await upsert.mutateAsync({
        data: {
          name: name.trim(),
          studentType,
          college,
          major: major.trim(),
          secondMajor: secondMajor === NONE_VALUE ? null : secondMajor.trim(),
          minor: minor === NONE_VALUE ? null : minor.trim(),
          startTerm: startTerm as "fall" | "winter" | "spring" | "summer",
          startYear,
          expectedGradTerm: expectedGradTerm as "fall" | "winter" | "spring" | "summer",
          expectedGradYear,
          unitsCompletedAtSCU,
          unitsTransferredIn,
          cumulativeGpa: Number(cumulativeGpa),
          majorGpa: Number(majorGpa),
          completedCourseCodes: completedCourses,
          priorityRegistration,
          currentTerm: currentTerm as "fall" | "winter" | "spring" | "summer",
          currentYear,
        },
      });
      await queryClient.invalidateQueries();
      setLocation("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error saving your profile.";
      toast({
        title: "Couldn't save your profile",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const onDeleteAccount = async () => {
    try {
      await fetch(getApiUrl("/profile"), { method: "DELETE" });
    } catch {
      // proceed to sign out anyway
    }
    try {
      localStorage.removeItem("campusval.apib.v1");
      localStorage.removeItem("campusval.planner.v1");
      localStorage.removeItem("campusval.schedule.v2");
    } catch {
      // ignore
    }
    await queryClient.invalidateQueries();
    await signOut({ redirectUrl: "/" });
  };

  const canNext0 = !nameError && !majorError && !startYearError;
  const canNext1 =
    !cumulativeGpaError &&
    !majorGpaError &&
    !unitsScuError &&
    !unitsXferError;
  const canFinish = !currentYearError && !expectedGradYearError;

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
          {STEPS.map((_, i) => (
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
                <Field label="Your name" required error={nameError}>
                  <Input
                    data-testid="input-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Bronco Buster"
                  />
                </Field>
                <Field label="Student type" required>
                  <Select
                    value={studentType}
                    onValueChange={(v) => setStudentType(v as StudentType)}
                  >
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
                <Field label="Major" required error={majorError}>
                  <MajorPicker
                    value={major}
                    onChange={setMajor}
                    options={collegeFilteredMajors}
                    placeholder="Choose your major…"
                    testId="select-major"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label="Second major"
                    hint='Optional — leave as "None" if not applicable.'
                  >
                    <MajorPicker
                      value={secondMajor === NONE_VALUE ? "" : secondMajor}
                      onChange={(v) => setSecondMajor(v || NONE_VALUE)}
                      options={majors}
                      placeholder="None"
                      allowNone
                      testId="select-second-major"
                    />
                  </Field>
                  <Field
                    label="Minor"
                    hint='Optional — leave as "None" if not applicable.'
                  >
                    <MajorPicker
                      value={minor === NONE_VALUE ? "" : minor}
                      onChange={(v) => setMinor(v || NONE_VALUE)}
                      options={minors}
                      placeholder="None"
                      allowNone
                      testId="select-minor"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Start term" required>
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
                  <Field label="Start year" required error={startYearError}>
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
                  <Field label="Units completed at SCU" required error={unitsScuError}>
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
                  <Field label="Units transferred in (quarter units)" required error={unitsXferError}>
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
                  <Field
                    label="Cumulative GPA"
                    required
                    hint="Number between 0.000 and 4.000."
                    error={cumulativeGpaError}
                  >
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
                  <Field
                    label="Major GPA"
                    required
                    hint="Number between 0.000 and 4.000."
                    error={majorGpaError}
                  >
                    <Input
                      data-testid="input-major-gpa"
                      type="number"
                      step="0.001"
                      min="0"
                      max="4"
                      placeholder="e.g. 3.500"
                      value={majorGpa}
                      onChange={(e) => setMajorGpa(e.target.value)}
                    />
                  </Field>
                </div>
                <Field
                  label="Completed courses"
                  hint='Search by code (format: "CSEN 11", "MATH 11") or by title. Leave empty if none yet.'
                >
                  <CompletedCoursesPicker
                    value={completedCourses}
                    onChange={setCompletedCourses}
                    catalog={catalog.map((c) => ({
                      code: c.code,
                      title: c.title,
                    }))}
                  />
                </Field>
                <ApIbSection stored={storedExams} onChange={setStoredExams} />
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
                  <Field label="Current term" required>
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
                  <Field label="Current year" required error={currentYearError}>
                    <Input
                      data-testid="input-current-year"
                      type="number"
                      value={currentYear}
                      onChange={(e) => setCurrentYear(Number(e.target.value))}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Expected graduation term" required>
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
                  <Field label="Expected graduation year" required error={expectedGradYearError}>
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
                {existing && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Label className="text-sm font-medium text-destructive">
                          Delete account
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Permanently removes your CampusVal profile, AI conversations,
                          and locally stored AP/IB credits, planner, and schedule.
                          You'll be signed out immediately.
                        </p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            data-testid="button-delete-account"
                          >
                            <Trash2 className="h-4 w-4 mr-1.5" />
                            Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently deletes your CampusVal profile and AI
                              conversation history. Your SCU account is unaffected.
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel data-testid="button-delete-cancel">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={onDeleteAccount}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              data-testid="button-delete-confirm"
                            >
                              Yes, delete my account
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )}
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
                disabled={upsert.isPending || !canFinish}
                data-testid="button-finish"
              >
                {upsert.isPending ? "Saving..." : existing ? "Save changes" : "Open my dashboard"}
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
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-primary ml-1">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function MajorPicker({
  value,
  onChange,
  options,
  placeholder,
  allowNone,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: MajorOption[];
  placeholder: string;
  allowNone?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.code === value || o.title === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
            "hover:bg-accent/30 focus:outline-none focus:ring-1 focus:ring-ring",
          )}
        >
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
            {selected ? selected.title : placeholder}
          </span>
          <ChevronRight className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search majors…" />
          <CommandList>
            <CommandEmpty>No majors match.</CommandEmpty>
            <CommandGroup>
              {allowNone && (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      !selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="italic text-muted-foreground">None</span>
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.code}
                  value={`${o.code} ${o.title}`}
                  onSelect={() => {
                    onChange(o.code);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected?.code === o.code ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="font-mono text-xs mr-2 text-muted-foreground">
                    {o.code}
                  </span>
                  <span className="truncate">{o.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CompletedCoursesPicker({
  value,
  onChange,
  catalog,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  catalog: { code: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(
    value.map((c) => c.toUpperCase().replace(/\s+/g, " ")),
  );
  const toggle = (code: string) => {
    const norm = code.toUpperCase().replace(/\s+/g, " ");
    if (selectedSet.has(norm)) {
      onChange(value.filter((v) => v.toUpperCase().replace(/\s+/g, " ") !== norm));
    } else {
      onChange([...value, code]);
    }
  };
  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="combobox-completed-courses"
            className={cn(
              "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
              "hover:bg-accent/30 focus:outline-none focus:ring-1 focus:ring-ring",
            )}
          >
            <span className="text-muted-foreground">
              {value.length === 0
                ? 'Add courses (e.g. "CSEN 11", "MATH 11")…'
                : `${value.length} course${value.length === 1 ? "" : "s"} selected — click to add more`}
            </span>
            <ChevronRight className="h-4 w-4 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder='Search "CSEN 11", "MATH", "Calculus"…' />
            <CommandList>
              <CommandEmpty>No courses match.</CommandEmpty>
              <CommandGroup>
                {catalog.map((c) => {
                  const norm = c.code.toUpperCase().replace(/\s+/g, " ");
                  const checked = selectedSet.has(norm);
                  return (
                    <CommandItem
                      key={c.code}
                      value={`${c.code} ${c.title}`}
                      onSelect={() => toggle(c.code)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          checked ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="font-mono text-xs mr-2 text-muted-foreground w-20 shrink-0">
                        {c.code}
                      </span>
                      <span className="truncate">{c.title}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((code) => (
            <Badge
              key={code}
              variant="secondary"
              className="font-mono pl-2 pr-1 py-0.5 text-xs flex items-center gap-1"
              data-testid={`pill-completed-${code.replace(/\s+/g, "-")}`}
            >
              {code}
              <button
                type="button"
                onClick={() => toggle(code)}
                className="hover:bg-background/50 rounded p-0.5"
                aria-label={`Remove ${code}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ApIbSection({
  stored,
  onChange,
}: {
  stored: StoredExam[];
  onChange: (s: StoredExam[]) => void;
}) {
  const ap = EXAM_CREDITS.filter((e) => e.category === "AP");
  const ib = EXAM_CREDITS.filter((e) => e.category === "IB");
  const setExam = (id: string, score: number | null) => {
    const without = stored.filter((s) => s.id !== id);
    if (score === null) {
      onChange(without);
    } else {
      onChange([...without, { id, score }]);
    }
  };
  const renderRow = (e: typeof EXAM_CREDITS[number]) => {
    const current = stored.find((s) => s.id === e.id);
    const earned = current && current.score >= e.minScore;
    return (
      <div
        key={e.id}
        data-testid={`apib-row-${e.id}`}
        className="grid grid-cols-12 items-center gap-2 text-sm py-1.5 border-b border-border/40 last:border-b-0"
      >
        <div className="col-span-7 text-foreground">
          <div className="font-medium truncate">{e.exam}</div>
          <div className="text-[10px] text-muted-foreground">
            ≥ {e.minScore} → {e.scuEquivalents.join(", ")}
          </div>
        </div>
        <div className="col-span-3">
          <Input
            type="number"
            min="1"
            max={e.category === "AP" ? "5" : "7"}
            placeholder="Score"
            value={current?.score ?? ""}
            onChange={(ev) => {
              const raw = ev.target.value;
              if (raw === "") setExam(e.id, null);
              else setExam(e.id, Number(raw));
            }}
            className="h-8 text-xs"
          />
        </div>
        <div className="col-span-2 text-right">
          {earned ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Credit
            </span>
          ) : current ? (
            <span className="text-[10px] text-muted-foreground italic">
              Below cutoff
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </div>
      </div>
    );
  };
  return (
    <div className="rounded-md border border-border bg-muted/10 p-4">
      <Label className="text-sm font-medium">AP / IB credit (optional)</Label>
      <p className="text-xs text-muted-foreground mt-0.5 mb-3">
        Enter your scores. Anything at or above SCU's cutoff will be treated as
        completed coursework on your graduation path. Stored locally on this
        device.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Advanced Placement (AP)
          </div>
          <div className="space-y-0">{ap.map(renderRow)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            International Baccalaureate (IB HL)
          </div>
          <div className="space-y-0">{ib.map(renderRow)}</div>
        </div>
      </div>
    </div>
  );
}
