import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  CHECKSHEET_CATEGORY_OPTIONS,
  PROGRAM_ROLE_OPTIONS,
  SUPPORTED_FORMATS_TEXT,
  errorMessage,
  formatBytes,
  safeExternalUrl,
  titleFromFileName,
  updateDegreeChecksheet,
  type DegreeChecksheetCategory,
  type DegreeChecksheetDocument,
  type DegreeChecksheetProgramRole,
} from '@workspace/api-client-react';
import { useInvalidateChecksheets } from '@/hooks/useChecksheets';
import {
  UPLOAD_PHASE_LABEL,
  fileFingerprint,
  pickChecksheetFile,
  uploadChecksheet,
  type ChecksheetDetails,
  type PickedFile,
  type UploadPhase,
} from '@/lib/checksheet-files';
import { Choice } from './TrackingEditor';
import type { Colors, Styles } from './theme';

interface Fields {
  title: string;
  category: DegreeChecksheetCategory;
  programName: string;
  programRole: DegreeChecksheetProgramRole | null;
  school: string;
  academicYearLabel: string;
  sourceUrl: string;
}

const blank: Fields = { title: '', category: 'major_checksheet', programName: '', programRole: null, school: '', academicYearLabel: '', sourceUrl: '' };

const fieldsOf = (document: DegreeChecksheetDocument): Fields => ({
  title: document.title,
  category: document.category,
  programName: document.programName ?? '',
  programRole: document.programRole,
  school: document.school ?? '',
  academicYearLabel: document.academicYearLabel ?? '',
  sourceUrl: document.sourceUrl ?? '',
});

/** What is sent: empty text is "not given", never an empty string. */
function detailsOf(fields: Fields): ChecksheetDetails | { error: string } {
  const title = fields.title.trim();
  if (!title) return { error: 'Give the document a title.' };
  const url = fields.sourceUrl.trim();
  if (url && !safeExternalUrl(url)) return { error: 'The source link must be a web address starting with https:// or http://.' };
  const text = (value: string) => value.trim() || null;
  return {
    title,
    category: fields.category,
    programName: text(fields.programName),
    programRole: fields.programRole,
    school: text(fields.school),
    academicYearLabel: text(fields.academicYearLabel),
    sourceUrl: url || null,
  };
}

function DetailsFields({ fields, set, styles, colors }: { fields: Fields; set: (next: Partial<Fields>) => void; styles: Styles; colors: Colors }) {
  return (
    <>
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        value={fields.title}
        onChangeText={(title) => set({ title })}
        maxLength={120}
        accessibilityLabel="Title"
        placeholder="Finance Major Checksheet"
        placeholderTextColor={colors.mutedForeground}
        testID="field-title"
      />

      <Text style={styles.label}>What is it?</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="What is it?">
        {CHECKSHEET_CATEGORY_OPTIONS.map((option) => (
          <Choice
            key={option.value}
            label={option.label}
            selected={fields.category === option.value}
            onPress={() => set({ category: option.value })}
            styles={styles}
            testID={`category-${option.value}`}
          />
        ))}
      </View>

      <Text style={styles.label}>Catalog or curriculum year (optional)</Text>
      <TextInput
        style={styles.input}
        value={fields.academicYearLabel}
        onChangeText={(academicYearLabel) => set({ academicYearLabel })}
        maxLength={120}
        accessibilityLabel="Catalog or curriculum year"
        placeholder="Fall 2025 and Later"
        placeholderTextColor={colors.mutedForeground}
      />
      <Text style={styles.small}>Recorded as you write it. CampusVal does not decide which year applies to you.</Text>

      <Text style={styles.label}>Program (optional)</Text>
      <TextInput
        style={styles.input}
        value={fields.programName}
        onChangeText={(programName) => set({ programName })}
        maxLength={120}
        accessibilityLabel="Program"
        placeholder="Finance"
        placeholderTextColor={colors.mutedForeground}
      />

      <Text style={styles.label}>This program is my (optional)</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="This program is my">
        <Choice label="Not set" selected={fields.programRole === null} onPress={() => set({ programRole: null })} styles={styles} />
        {PROGRAM_ROLE_OPTIONS.map((option) => (
          <Choice
            key={option.value}
            label={option.label}
            selected={fields.programRole === option.value}
            onPress={() => set({ programRole: option.value })}
            styles={styles}
          />
        ))}
      </View>

      <Text style={styles.label}>School (optional)</Text>
      <TextInput
        style={styles.input}
        value={fields.school}
        onChangeText={(school) => set({ school })}
        maxLength={120}
        accessibilityLabel="School"
        placeholder="Leavey School of Business"
        placeholderTextColor={colors.mutedForeground}
      />

      <Text style={styles.label}>Where it came from (optional)</Text>
      <TextInput
        style={styles.input}
        value={fields.sourceUrl}
        onChangeText={(sourceUrl) => set({ sourceUrl })}
        maxLength={2000}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        accessibilityLabel="Where it came from, a web address"
        placeholder="https://www.scu.edu/…"
        placeholderTextColor={colors.mutedForeground}
      />
    </>
  );
}

function SheetFrame({ title, onClose, busy, children, colors, styles }: { title: string; onClose: () => void; busy: boolean; children: React.ReactNode; colors: Colors; styles: Styles }) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !busy && onClose()}>
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            {title}
          </Text>
          <Pressable style={styles.iconButton} onPress={onClose} disabled={busy} accessibilityRole="button" accessibilityLabel="Close">
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function ErrorNote({ message, styles }: { message: string | null; styles: Styles }) {
  if (!message) return null;
  return (
    <View style={[styles.notice, styles.warning, { marginTop: 12 }]} accessibilityRole="alert" testID="form-error">
      <Text style={[styles.body, styles.warningText]}>{message}</Text>
    </View>
  );
}

/** Upload a new document: choose the file, say what it is. */
export function UploadSheet({
  documents,
  maxUploadBytes,
  onClose,
  onUploaded,
  colors,
  styles,
}: {
  documents: DegreeChecksheetDocument[];
  maxUploadBytes: number;
  onClose: () => void;
  onUploaded: (document: DegreeChecksheetDocument) => void;
  colors: Colors;
  styles: Styles;
}) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [fields, setFields] = useState<Fields>(blank);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DegreeChecksheetDocument | null>(null);
  const invalidate = useInvalidateChecksheets();
  const busy = phase !== 'idle';

  const choose = async () => {
    setError(null);
    setDuplicate(null);
    const picked = await pickChecksheetFile(maxUploadBytes);
    if ('cancelled' in picked) return;
    if ('error' in picked) {
      setFile(null);
      setError(picked.error);
      return;
    }
    setFile(picked.file);
    setFields((current) => (current.title.trim() ? current : { ...current, title: titleFromFileName(picked.file.name) }));
    const fingerprint = await fileFingerprint(picked.file);
    setDuplicate(fingerprint ? (documents.find((document) => document.fileFingerprint === fingerprint) ?? null) : null);
  };

  const submit = async () => {
    if (!file) return setError('Choose a file first.');
    const details = detailsOf(fields);
    if ('error' in details) return setError(details.error);
    setError(null);
    try {
      const document = await uploadChecksheet(file, details, setPhase);
      invalidate(document.id);
      onUploaded(document);
    } catch (err) {
      setError(errorMessage(err, err instanceof Error ? err.message : 'Upload failed. Please try again.'));
    }
  };

  return (
    <SheetFrame title="Upload Checksheet" onClose={onClose} busy={busy} colors={colors} styles={styles}>
      <Text style={styles.small}>
        Choose the document your department published. It is stored privately and never changed. Supported: {SUPPORTED_FORMATS_TEXT}, up
        to {Math.round(maxUploadBytes / (1024 * 1024))} MB.
      </Text>
      <Pressable style={[styles.button, styles.outline, { marginTop: 12 }]} onPress={choose} disabled={busy} accessibilityRole="button" testID="choose-file">
        <Feather name="file" size={16} color={colors.foreground} />
        <Text style={styles.outlineText}>{file ? 'Choose a different file' : 'Choose a file'}</Text>
      </Pressable>
      {file && (
        <Text style={[styles.small, { marginTop: 6 }]} testID="chosen-file">
          {file.name} · {formatBytes(file.size)}
        </Text>
      )}
      {duplicate && (
        <View style={[styles.notice, styles.warning, { marginTop: 10 }]} testID="duplicate-note">
          <Text style={[styles.body, styles.warningText]}>
            This file appears to already be uploaded as “{duplicate.title}”. You can upload it again: each copy has its own tracking.
          </Text>
        </View>
      )}
      <DetailsFields fields={fields} set={(next) => setFields((current) => ({ ...current, ...next }))} styles={styles} colors={colors} />
      <ErrorNote message={error} styles={styles} />
      <Pressable
        style={[styles.button, styles.primary, { marginTop: 20 }, (busy || !file) && styles.disabled]}
        disabled={busy || !file}
        onPress={submit}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !file, busy }}
        testID="upload-submit"
      >
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Feather name="upload" size={16} color="#FFFFFF" />}
        <Text style={styles.primaryText}>{busy ? UPLOAD_PHASE_LABEL[phase] : duplicate ? 'Upload Anyway' : 'Upload'}</Text>
      </Pressable>
    </SheetFrame>
  );
}

/** Rename, or edit what the student said the document is. The file is not touched. */
export function EditDetailsSheet({
  document,
  onlyTitle,
  onClose,
  colors,
  styles,
}: {
  document: DegreeChecksheetDocument;
  onlyTitle: boolean;
  onClose: () => void;
  colors: Colors;
  styles: Styles;
}) {
  const [fields, setFields] = useState<Fields>(() => fieldsOf(document));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateChecksheets();

  const save = async () => {
    const details = detailsOf(fields);
    if ('error' in details) return setError(details.error);
    setBusy(true);
    setError(null);
    try {
      await updateDegreeChecksheet(document.id, onlyTitle ? { title: details.title } : details);
      invalidate();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'The change could not be saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetFrame title={onlyTitle ? 'Rename' : 'Edit details'} onClose={onClose} busy={busy} colors={colors} styles={styles}>
      <Text style={styles.small}>This changes how the document is listed. The file and its upload date stay as they are.</Text>
      {onlyTitle ? (
        <>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={fields.title}
            onChangeText={(title) => setFields((current) => ({ ...current, title }))}
            maxLength={120}
            autoFocus
            accessibilityLabel="Title"
            testID="rename-input"
          />
        </>
      ) : (
        <DetailsFields fields={fields} set={(next) => setFields((current) => ({ ...current, ...next }))} styles={styles} colors={colors} />
      )}
      <ErrorNote message={error} styles={styles} />
      <Pressable
        style={[styles.button, styles.primary, { marginTop: 20 }, busy && styles.disabled]}
        disabled={busy}
        onPress={save}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        testID="details-save"
      >
        {busy && <ActivityIndicator color="#FFFFFF" />}
        <Text style={styles.primaryText}>Save</Text>
      </Pressable>
    </SheetFrame>
  );
}
