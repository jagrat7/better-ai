export interface ServiceI<TInput, TResult, TJson = TResult> {
    /**
     * Run the service with the given input
     * @param input The input to the service
     * @returns The result of the service
     */
    run(input: TInput): Promise<TResult> | TResult

    /**
     * Convert the result to JSON
     * @param result The result to convert
     * @returns The JSON representation of the result
     */
    json(result: TResult): TJson

    /**
     * Execute a command with the given result
     * @param result The result to use for the command
     * @returns A promise that resolves when the command is executed
     */
    command(result: TResult): Promise<void> | void
}