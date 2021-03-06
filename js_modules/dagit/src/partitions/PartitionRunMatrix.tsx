import {gql, useQuery} from '@apollo/client';
import {Checkbox, Colors, Dialog, Button, Classes} from '@blueprintjs/core';
import * as React from 'react';
import styled from 'styled-components/macro';

import {GraphQueryInput} from 'src/GraphQueryInput';
import {TokenizingFieldValue} from 'src/TokenizingField';
import {OptionsDivider} from 'src/VizComponents';
import {useViewport} from 'src/gaant/useViewport';
import {useQueryPersistedState} from 'src/hooks/useQueryPersistedState';
import {PartitionRunListForStep} from 'src/partitions/PartitionRunListForStep';
import {
  GridColumn,
  GridFloatingContainer,
  GridScrollContainer,
  LeftLabel,
  TopLabel,
  TopLabelTilted,
} from 'src/partitions/RunMatrixUtils';
import {RunTagsTokenizingField} from 'src/partitions/RunTagsTokenizingField';
import {SliceSlider} from 'src/partitions/SliceSlider';
import {
  PartitionRunMatrixPipelineQuery,
  PartitionRunMatrixPipelineQueryVariables,
} from 'src/partitions/types/PartitionRunMatrixPipelineQuery';
import {PartitionRunMatrixRunFragment} from 'src/partitions/types/PartitionRunMatrixRunFragment';
import {
  useMatrixData,
  MatrixStep,
  DisplayOptions,
  StatusSquareFinalColor,
} from 'src/partitions/useMatrixData';
import {repoAddressToSelector} from 'src/workspace/repoAddressToSelector';
import {RepoAddress} from 'src/workspace/types';

const TITLE_TOTAL_FAILURES = 'This step failed at least once for this percent of partitions.';

const TITLE_FINAL_FAILURES = 'This step failed to run successfully for this percent of partitions.';

const BOX_COL_WIDTH = 23;

const OVERSCROLL = 150;

const SORT_FINAL_ASC = 'FINAL_ASC';
const SORT_FINAL_DESC = 'FINAL_DESC';
const SORT_TOTAL_ASC = 'TOTAL_ASC';
const SORT_TOTAL_DESC = 'TOTAL_DESC';

interface PartitionRunSelection {
  partitionName: string;
  stepName: string;
}

interface PartitionRunMatrixProps {
  pipelineName: string;
  partitions: {name: string; runs: PartitionRunMatrixRunFragment[]}[];
  repoAddress: RepoAddress;
  runTags: TokenizingFieldValue[];
  setRunTags: (val: TokenizingFieldValue[]) => void;
  stepQuery: string;
  setStepQuery: (val: string) => void;
}

export const PartitionRunMatrix: React.FC<PartitionRunMatrixProps> = (props) => {
  const {viewport, containerProps} = useViewport();
  const [colorizeSliceUnix, setColorizeSliceUnix] = React.useState(0);
  const [hovered, setHovered] = React.useState<PartitionRunSelection | null>(null);
  const [focused, setFocused] = useQueryPersistedState<PartitionRunSelection | null>({
    encode: (val) => ({partitionName: val?.partitionName, stepName: val?.stepName}),
    decode: (qs) =>
      qs.partitionName && qs.stepName
        ? {partitionName: qs.partitionName, stepName: qs.stepName}
        : null,
  });
  const [stepSort = '', setStepSort] = useQueryPersistedState<string>({queryKey: 'stepSort'});
  const [options, setOptions] = useQueryPersistedState<DisplayOptions>({
    decode: (qs) => ({
      showPrevious: qs.showPrevious === 'true',
      colorizeByAge: qs.colorizeByAge === 'true',
      showFailuresAndGapsOnly: qs.showFailuresAndGapsOnly === 'true',
    }),
    defaults: {
      showPrevious: false,
      colorizeByAge: false,
      showFailuresAndGapsOnly: false,
    },
  });

  // Retrieve the pipeline's structure
  const repositorySelector = repoAddressToSelector(props.repoAddress);
  const pipelineSelector = {...repositorySelector, pipelineName: props.pipelineName};
  const pipeline = useQuery<
    PartitionRunMatrixPipelineQuery,
    PartitionRunMatrixPipelineQueryVariables
  >(PARTITION_RUN_MATRIX_PIPELINE_QUERY, {
    variables: {pipelineSelector},
  });

  const solidHandles =
    pipeline.data?.pipelineSnapshotOrError.__typename === 'PipelineSnapshot' &&
    pipeline.data.pipelineSnapshotOrError.solidHandles;

  const data = useMatrixData({
    partitions: props.partitions,
    stepQuery: props.stepQuery,
    solidHandles,
    options,
  });

  if (!data || !solidHandles) {
    return <span />;
  }

  const {stepRows, partitionColumns, partitions} = data;
  if (stepSort === SORT_FINAL_ASC) {
    stepRows.sort((a, b) => a.finalFailurePercent - b.finalFailurePercent);
  } else if (stepSort === SORT_FINAL_DESC) {
    stepRows.sort((a, b) => b.finalFailurePercent - a.finalFailurePercent);
  } else if (stepSort === SORT_TOTAL_ASC) {
    stepRows.sort((a, b) => a.totalFailurePercent - b.totalFailurePercent);
  } else if (stepSort === SORT_TOTAL_DESC) {
    stepRows.sort((a, b) => b.totalFailurePercent - a.totalFailurePercent);
  }

  const sortPartitionSteps = (steps: MatrixStep[]) => {
    const stepsByName = {};
    steps.forEach((step) => (stepsByName[step.name] = step));
    return stepRows.map((stepRow) => stepsByName[stepRow.name]);
  };

  const visibleRangeStart = Math.max(0, Math.floor((viewport.left - OVERSCROLL) / BOX_COL_WIDTH));
  const visibleCount = Math.ceil((viewport.width + OVERSCROLL * 2) / BOX_COL_WIDTH);
  const visibleColumns = partitionColumns.slice(
    visibleRangeStart,
    visibleRangeStart + visibleCount,
  );

  let [minUnix, maxUnix] = [Date.now() / 1000, 1];
  for (const partition of partitionColumns) {
    for (const step of partition.steps) {
      if (step.unix === 0) {
        continue;
      }
      [minUnix, maxUnix] = [Math.min(minUnix, step.unix), Math.max(maxUnix, step.unix)];
    }
  }

  return (
    <PartitionRunMatrixContainer>
      <Dialog
        isOpen={!!focused}
        onClose={() => setFocused(null)}
        style={{width: '90vw'}}
        title={focused ? `${focused.partitionName} runs (${focused.stepName})` : ''}
      >
        <div style={{background: Colors.WHITE, padding: 15, marginBottom: 15}}>
          {focused && (
            <PartitionRunListForStep
              pipelineName={props.pipelineName}
              partitionName={focused.partitionName}
              stepName={focused.stepName}
              stepStatsByRunId={Object.assign(
                {},
                ...(props.partitions.find((p) => p.name === focused.partitionName)?.runs || []).map(
                  (run) => ({
                    [run.runId]: run.stepStats.find((s) =>
                      s.stepKey.startsWith(`${focused.stepName}.`),
                    ),
                  }),
                ),
              )}
            />
          )}
        </div>
        <div className={Classes.DIALOG_FOOTER}>
          <div className={Classes.DIALOG_FOOTER_ACTIONS}>
            <Button intent="primary" autoFocus={true} onClick={() => setFocused(null)}>
              OK
            </Button>
          </div>
        </div>
      </Dialog>
      <OptionsContainer>
        <strong>Run Matrix</strong>
        <div style={{width: 10}} />
        <Checkbox
          label="Show Previous States"
          checked={options.showPrevious}
          onChange={() => setOptions({...options, showPrevious: !options.showPrevious})}
          style={{marginBottom: 0, height: 20}}
        />
        <OptionsDivider />
        <Checkbox
          label="Only Show Failures and Gaps"
          checked={options.showFailuresAndGapsOnly}
          onChange={() =>
            setOptions({...options, showFailuresAndGapsOnly: !options.showFailuresAndGapsOnly})
          }
          style={{marginBottom: 0, height: 20}}
        />
        <OptionsDivider />
        <Checkbox
          label="Colorize by Age"
          checked={options.colorizeByAge}
          onChange={() => setOptions({...options, colorizeByAge: !options.colorizeByAge})}
          style={{marginBottom: 0, height: 20}}
        />
        <div style={{width: 20}} />
        <SliceSlider
          disabled={!options.colorizeByAge}
          value={Math.max(minUnix, colorizeSliceUnix)}
          onChange={setColorizeSliceUnix}
          maxUnix={maxUnix}
          minUnix={minUnix}
        />
        <div style={{flex: 1}} />
        <RunTagsTokenizingField
          runs={partitions.reduce((a, b) => [...a, ...b.runs], [])}
          onChange={props.setRunTags}
          tokens={props.runTags}
        />
      </OptionsContainer>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          border: `1px solid ${Colors.GRAY5}`,
          borderLeft: 0,
        }}
      >
        <GridFloatingContainer floating={viewport.left > 0}>
          <GridColumn disabled style={{flexShrink: 1, overflow: 'hidden'}}>
            <TopLabel>
              <GraphQueryInput
                small
                width={260}
                items={solidHandles.map((h) => h.solid)}
                value={props.stepQuery}
                placeholder="Type a Step Subset"
                onChange={props.setStepQuery}
              />
            </TopLabel>
            {stepRows.map((step) => (
              <LeftLabel
                style={{paddingLeft: step.x}}
                key={step.name}
                data-tooltip={step.name}
                hovered={step.name === hovered?.stepName}
              >
                {step.name}
              </LeftLabel>
            ))}
            <Divider />
            <LeftLabel style={{paddingLeft: 5}}>Runs</LeftLabel>
          </GridColumn>
          <GridColumn disabled>
            <TopLabel>
              <div
                style={{cursor: 'pointer'}}
                className="square failure-blank"
                title={TITLE_TOTAL_FAILURES}
                onClick={() =>
                  setStepSort(stepSort === SORT_TOTAL_DESC ? SORT_TOTAL_ASC : SORT_TOTAL_DESC)
                }
              />
            </TopLabel>
            {stepRows.map(({totalFailurePercent, name}, idx) => (
              <LeftLabel
                key={idx}
                title={TITLE_TOTAL_FAILURES}
                hovered={name === hovered?.stepName}
                redness={totalFailurePercent / 100}
              >
                {`${totalFailurePercent}%`}
              </LeftLabel>
            ))}
            <Divider />
          </GridColumn>
          <GridColumn disabled>
            <TopLabel>
              <div
                style={{cursor: 'pointer'}}
                className="square failure"
                title={TITLE_FINAL_FAILURES}
                onClick={() =>
                  setStepSort(stepSort === SORT_FINAL_DESC ? SORT_FINAL_ASC : SORT_FINAL_DESC)
                }
              />
            </TopLabel>
            {stepRows.map(({finalFailurePercent, name}, idx) => (
              <LeftLabel
                key={idx}
                title={TITLE_FINAL_FAILURES}
                hovered={name === hovered?.stepName}
                redness={finalFailurePercent / 100}
              >
                {`${finalFailurePercent}%`}
              </LeftLabel>
            ))}
            <Divider />
          </GridColumn>
        </GridFloatingContainer>
        <GridScrollContainer {...containerProps}>
          <div
            style={{
              width: partitionColumns.length * BOX_COL_WIDTH,
              position: 'relative',
              height: '100%',
            }}
          >
            {visibleColumns.map((p, idx) => (
              <GridColumn
                key={p.name}
                style={{
                  zIndex: visibleColumns.length - idx,
                  width: BOX_COL_WIDTH,
                  position: 'absolute',
                  left: (idx + visibleRangeStart) * BOX_COL_WIDTH,
                }}
                dimSuccesses={!options.colorizeByAge}
              >
                <TopLabelTilted>
                  <div className="tilted">{p.name}</div>
                </TopLabelTilted>
                {sortPartitionSteps(p.steps).map(({name, color, unix}) => (
                  <div
                    key={name}
                    className={`
                      square 
                      ${p.runs.length === 0 && 'empty'}
                      ${(options.showPrevious
                        ? color
                        : StatusSquareFinalColor[color] || color
                      ).toLowerCase()}
                    `}
                    onClick={() =>
                      p.runs.length > 0 && setFocused({stepName: name, partitionName: p.name})
                    }
                    onMouseEnter={() => setHovered({stepName: name, partitionName: p.name})}
                    onMouseLeave={() => setHovered(null)}
                    style={
                      options.colorizeByAge
                        ? {
                            opacity:
                              unix >= colorizeSliceUnix
                                ? 0.3 + 0.7 * ((unix - minUnix) / (maxUnix - minUnix))
                                : 0.08,
                          }
                        : {}
                    }
                  />
                ))}
                <Divider />
                <LeftLabel style={{textAlign: 'center'}}>{p.runs.length}</LeftLabel>
              </GridColumn>
            ))}
          </div>
        </GridScrollContainer>
      </div>
    </PartitionRunMatrixContainer>
  );
};

const PartitionRunMatrixContainer = styled.div`
  display: block;
`;

const OptionsContainer = styled.div`
  display: flex;
  align-items: center;
  padding: 6px 0;
`;

const Divider = styled.div`
  height: 1px;
  width: 100%;
  margin-top: 5px;
  border-top: 1px solid ${Colors.GRAY5};
`;

export const PARTITION_RUN_MATRIX_RUN_FRAGMENT = gql`
  fragment PartitionRunMatrixRunFragment on PipelineRun {
    id
    runId
    tags {
      key
      value
    }
    stats {
      __typename
      ... on PipelineRunStatsSnapshot {
        id
        startTime
      }
    }
    stepStats {
      __typename
      stepKey
      status
      materializations {
        __typename
      }
      expectationResults {
        success
      }
    }
  }
`;

export const PARTITION_RUN_MATRIX_PIPELINE_QUERY = gql`
  query PartitionRunMatrixPipelineQuery($pipelineSelector: PipelineSelector) {
    pipelineSnapshotOrError(activePipelineSelector: $pipelineSelector) {
      ... on PipelineSnapshot {
        id
        name
        solidHandles {
          handleID
          solid {
            name
            definition {
              name
            }
            inputs {
              dependsOn {
                solid {
                  name
                }
              }
            }
            outputs {
              dependedBy {
                solid {
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;
