import {
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  TextField,
} from "@mui/material";
import React from "react";
import { AdminActionBar, AdminFieldGrid, AdminFormSection } from '../admin/adminPrimitives.js';
import {
  type CategoryDistanceRule,
  type EventCatalogCategory,
} from "../../catalog/eventCatalog.js";
import { IdentifierDisplay } from "../../controls/identifierDisplay.js";
import { MinMaxSelect, type MinMaxSelectOption } from "../../controls/minMaxSelect.js";
import { SelectTextField } from "../../controls/selectTextField.js";
import { type SessionId } from "../../model/raceevent.js";
import { type CategoryDraft } from "../display/categoriesPage.js";

interface CategoryDetailsPanelProps {
  categoryDraft: CategoryDraft;
  deleteError?: string;
  deleteStatus: "idle" | "pending" | "succeeded" | "failed";
  eventSessions: Array<{ id: SessionId; name: string; scheduledStart: string }>;
  formError?: string;
  onDeleteCategory: () => void | Promise<void>;
  onSaveCategory: () => boolean | Promise<boolean>;
  onSetCategoryDraft: React.Dispatch<React.SetStateAction<CategoryDraft>>;
  selectedCategory?: EventCatalogCategory;
  warningModal?: React.ReactNode;
}

const riderAgeOptions: readonly MinMaxSelectOption[] = Array.from({ length: 121 }, (_value: undefined, age: number): MinMaxSelectOption => ({
  label: `${age} years`, value: age.toString(),
}));

const teamSizeOptions: readonly MinMaxSelectOption[] = Array.from({ length: 99 }, (_value: undefined, teamSize: number): MinMaxSelectOption => ({
  label: `${teamSize + 2}`, value: `${teamSize + 2}`,
}));

export const CategoryDetailsPanel = (
  props: CategoryDetailsPanelProps,
): React.ReactElement => {
  const [saveError, setSaveError] = React.useState<string | undefined>(
    undefined,
  );
  const [saveStatus, setSaveStatus] = React.useState<
    "failed" | "idle" | "pending" | "succeeded"
  >("idle");
  const update = <TKey extends keyof CategoryDraft>(
    key: TKey,
    value: CategoryDraft[TKey],
  ): void =>
      props.onSetCategoryDraft((current) => ({ ...current, [key]: value }));
  React.useEffect((): void => {
    setSaveError(undefined);
    setSaveStatus("idle");
  }, [props.selectedCategory?.id]);
  const saveCategory = (): void => {
    setSaveError(undefined);
    setSaveStatus("pending");
    Promise.resolve()
      .then((): boolean | Promise<boolean> => props.onSaveCategory())
      .then(
        (saved: boolean): void => setSaveStatus(saved ? "succeeded" : "failed"),
        (error: unknown): void => {
          setSaveError(error instanceof Error ? error.message : String(error));
          setSaveStatus("failed");
        },
      );
  };
  return (
    <AdminFormSection className="events-panel" title="Category Details">
      {props.selectedCategory ? (
        <><AdminFieldGrid>
          <TextField
            fullWidth
            label="Category Name"
            slotProps={{ htmlInput: { "aria-label": "Category Name" } }}
            value={props.categoryDraft.name}
            onChange={(event) => update("name", event.target.value)}
          />
          <TextField
            fullWidth
            label="Category Code"
            slotProps={{ htmlInput: { "aria-label": "Category Code" } }}
            value={props.categoryDraft.code}
            onChange={(event) => update("code", event.target.value)}
          />
          <TextField
            fullWidth
            label="Description"
            multiline
            slotProps={{ htmlInput: { "aria-label": "Category Description" } }}
            value={props.categoryDraft.description}
            onChange={(event) => update("description", event.target.value)}
          />
          <SelectTextField
            fullWidth
            label="Calculate elapsed time from"
            slotProps={{
              select: {
                "aria-label": "Category Calculate Elapsed Time From",
                native: true,
              },
            }}
            value={props.categoryDraft.elapsedTimeCalculation}
            onChange={(event) =>
              update("elapsedTimeCalculation", event.target.value)
            }
          >
            <option value="">Inherit session/event</option>
            <option value="first-start">First start</option>
            <option value="category-start">Category start</option>
          </SelectTextField>
          <SelectTextField
            fullWidth
            label="Calculate lap 1 from"
            slotProps={{
              select: {
                "aria-label": "Category Calculate Lap 1 From",
                native: true,
              },
            }}
            value={props.categoryDraft.lap1Calculation}
            onChange={(event) => update("lap1Calculation", event.target.value)}
          >
            <option value="">Inherit session/event</option>
            <option value="first-start">First start</option>
            <option value="category-start">Category start</option>
          </SelectTextField>
          <FormControlLabel
            control={
              <Checkbox
                checked={props.categoryDraft.excludeFromResults}
                slotProps={{
                  input: { "aria-label": "Category Exclude From Results" },
                }}
                onChange={(event) =>
                  update("excludeFromResults", event.target.checked)
                }
              />
            }
            label="Exclude from results"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={props.categoryDraft.isPlaceholder}
                slotProps={{
                  input: { "aria-label": "Category Is Placeholder" },
                }}
                onChange={(event) =>
                  update("isPlaceholder", event.target.checked)
                }
              />
            }
            label="Placeholder category"
          />
          <SelectTextField
            fullWidth
            label="Distance Type"
            slotProps={{
              select: {
                "aria-label": "Category Distance Rule Type",
                native: true,
              },
            }}
            value={props.categoryDraft.distanceRuleKind}
            onChange={(event) =>
              update(
                "distanceRuleKind",
                event.target.value as CategoryDistanceRule["kind"],
              )
            }
          >
            <option value="unspecified">Unspecified</option>
            <option value="time">Time</option>
            <option value="laps">Laps</option>
          </SelectTextField>
          {props.categoryDraft.distanceRuleKind !== "unspecified" ? (
            <TextField
              fullWidth
              label="Distance Value"
              placeholder={
                props.categoryDraft.distanceRuleKind === "time"
                  ? "45 or 1:30"
                  : "12"
              }
              slotProps={{
                htmlInput: { "aria-label": "Category Distance Rule Value" },
              }}
              value={props.categoryDraft.distanceRuleValue}
              onChange={(event) =>
                update("distanceRuleValue", event.target.value)
              }
            />
          ) : null}
          <SelectTextField
            fullWidth
            label="Entrant Identity"
            slotProps={{
              select: {
                "aria-label": "Category Entrant Identity",
                native: true,
              },
            }}
            value={props.categoryDraft.identityMode}
            onChange={(event) =>
              update(
                "identityMode",
                event.target.value as "single" | "multiple",
              )
            }
          >
            <option value="single">Single identity</option>
            <option value="multiple">Multiple identity</option>
          </SelectTextField>
          <SelectTextField
            disabled={props.categoryDraft.identityMode === "single"}
            fullWidth
            label="Maximum team size"
            slotProps={{
              select: { "aria-label": "Category Max Team Size", native: true },
            }}
            value={props.categoryDraft.maxTeamSize}
            onChange={(event) => update("maxTeamSize", event.target.value)}
          >
            <option value="">No maximum</option>
            {teamSizeOptions.map((option: MinMaxSelectOption) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectTextField>
          <MinMaxSelect
            maxAriaLabel="Category Max Rider Age"
            maxEmptyLabel="No maximum age"
            maxLabel="Maximum rider age"
            maxValue={props.categoryDraft.maxRiderAge}
            minAriaLabel="Category Min Rider Age"
            minEmptyLabel="No minimum age"
            minLabel="Minimum rider age"
            minValue={props.categoryDraft.minRiderAge}
            onMaxChange={(value: string): void => update("maxRiderAge", value)}
            onMinChange={(value: string): void => update("minRiderAge", value)}
            options={riderAgeOptions}
            sx={{ gridColumn: "1 / -1" }}
          />
          <TextField
            fullWidth
            label="Team Gender Rules"
            multiline
            placeholder="female:1:2; male:1:3"
            slotProps={{
              htmlInput: { "aria-label": "Category Team Gender Rules" },
            }}
            value={props.categoryDraft.teamCompositionRules}
            onChange={(event) =>
              update("teamCompositionRules", event.target.value)
            }
          />
          <SelectTextField
            fullWidth
            label="Session Assignments"
            slotProps={{
              select: {
                "aria-label": "Category Session Assignments",
                multiple: true,
                native: true,
              },
            }}
            value={props.categoryDraft.sessionIds.filter((sessionId) =>
              props.eventSessions.some((session) => session.id === sessionId),
            )}
            onChange={(event) =>
              update(
                "sessionIds",
                Array.from(
                  (event.target as unknown as HTMLSelectElement)
                    .selectedOptions,
                ).map((option) => option.value),
              )
            }
          >
            {props.eventSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </SelectTextField>
        </AdminFieldGrid><AdminActionBar error={props.deleteError} pending={saveStatus === 'pending'}>
          <div className="category-save-status">
            <Button
              disabled={saveStatus === "pending"}
              endIcon={
                saveStatus === "pending" ? (
                  <CircularProgress aria-label="Saving category" size={16} />
                ) : saveStatus === "succeeded" ? (
                  <span aria-label="Category saved" role="img">
                      ✓
                  </span>
                ) : saveStatus === "failed" ? (
                  <span aria-label="Category save failed" role="img">
                      !
                  </span>
                ) : undefined
              }
              onClick={saveCategory}
              variant="contained"
            >
                Save Category
            </Button>
            {saveError || props.formError ? (
              <div className="error category-save-error" role="alert">
                <p>{saveError || props.formError}</p>
              </div>
            ) : null}
          </div>
          <div className="category-delete-status">
            <Button
              color="error"
              disabled={props.deleteStatus === "pending"}
              endIcon={
                props.deleteStatus === "pending" ? (
                  <CircularProgress
                    aria-label="Deleting category"
                    size={16}
                  />
                ) : props.deleteStatus === "succeeded" ? (
                  <span aria-label="Category deleted" role="img">
                      ✓
                  </span>
                ) : props.deleteStatus === "failed" ? (
                  <span aria-label="Category deletion failed" role="img">
                      !
                  </span>
                ) : undefined
              }
              onClick={() => props.onDeleteCategory()}
              variant="outlined"
            >
                Delete Category
            </Button>
            {props.deleteError ? (
              <span className="error category-delete-error" role="alert">
                {props.deleteError}
              </span>
            ) : null}
          </div>
          <IdentifierDisplay label="Category ID" value={props.selectedCategory.id.toString()} />
        </AdminActionBar>
        {props.warningModal}
        </>
      ) : (
        <p>No categories are defined for this event.</p>
      )}
    </AdminFormSection>
  );
};
