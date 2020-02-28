export enum ProblemSeverity {
    debug, info, warn, error, fatal,
}

export interface FileProblem {
    /**
     * Message
     */
    message: string;

    severity: ProblemSeverity;

    /**
     * Line number
     */
    line: number;
}

export interface ModelProblem {
    /**
     * Fully qualifed file name
     */
    file: string;

    /**
     * An array of the file problems
     */
    problems: FileProblem[];
}

/**
 * Indicate problems which were detected during loading.
 * In order to reduce the size of the response message, problems are grouped by file.
 * The ``total_problems`` field is used to indicate the total number of problems which may be lower
 * than the number actually returned. If the total number of problems is unknown, ``total_problems``
 * should be set to -1. This may be the case when problem detection is interrupted in order to
 * limit detection effort and/or response time.
 */
export interface LoadModelResponse {
    /**
     * Number of total problems or -1
     */
    total_problems: number;

    /**
     * An array of the problems grouped by file
     */
    problems: ModelProblem[];
}

/**
 * Version information. Introduced in version 1.
 * The backend supporting protocool version 0 only responds with an 'Unknown Command Error'.
 */
export interface VersionResponse {
    version: number;
}

/**
 * Textual description to be shown to the user
 */
export interface ContextInformationResponse {
    desc: string;
}

export interface CompletionOption {
    /**
     * Text to display.
     * Contains the string which should be displayed to the user in some kind of
     * completion option menu. An optional description field may provide more information about a
     * particular option.
     */
    display: string;

    /**
     * Text to be inserted.
     * Holds the text to be inserted if the completion option is chosen. This text
     * may contains placeholders for cursor position. An editor may use them to assist a user in
     * filling additional completion fields.
     * Each placeholder must start and end with a vertical bar character (``|``) and can contain up to
     * three optional parts separated by an additional vertical bar character: ordering number, name and
     * description of this cursor position. E.g.: ``||``, ``|1|name|Entity name|``, ``|||New value|``.
     * Placeholders with the same name must be considered as the same value repeated in different
     * positions.
     */
    insert: string;

    /**
     * Optional description.
     */
    desc: string;
}

/**
 * If there are no completion options, the backend may send an empty response.
 */
export interface ContentCompleteResponse {
    options: CompletionOption[];
}

export interface LinkTarget {
    /**
     * The string to be displayed to the user,
     */
    display: string;

    /**
     * The filename.
     */
    file: string;

    /**
     * The line number within the file.
     */
    line: number;

    /**
     * An optional description field may provide more information about a particular link target.
     */
    desc: string;
}

/**
 * If there is no link, the backend may send an empty response.
 */
export interface LinkTargetsResponse {
    /**
     * The column of the beginning of the link.
     * Column positions are inclusive, i.e. are part of the link.
     */
    begin_column: number;

    /**
     * The column of the end of the link.
     * Column positions are inclusive, i.e. are part of the link.
     */
    end_column: number;

    /**
     * Actual link targets.
     */
    targets: LinkTarget[];
}

export interface FindElement {
    /**
     * The string to be displayed to the user,
     */
    display: string;

    /**
     * The filename.
     */
    file: string;

    /**
     * The line number within the file.
     */
    line: number;

    /**
     * An optional description field my provide more information about a particular element.
     */
    desc: string;
}

/**
 * If there are no search results, the backend may send an empty response.
 */
export interface FindElementsResponse {
    /**
     * The total number of elements found.
     * Note that the number of elements actually returned may be lower than the total number.
     * If the total number of elements is unknown ``total_elements`` should be set to -1.
     * This allows to truncate large search result sets and still provide the user with the number of
     * elements which were omitted or at least with the fact that the result set has been truncated.
     */
    total_elements: number;

    /**
     * A list of elements found.
     */
    elements: FindElement[];
}
