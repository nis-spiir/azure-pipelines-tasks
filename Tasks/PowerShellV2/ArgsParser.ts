type PowerShellTelemetry = {
    nestedQuotes: number,
    closedQuotePairs: number,
    escapedQuotes: number,
    backticks: number,
    escapedBackticks: number,
    backticksInSingleQuotes: number,
    specialCharacters: number,
    // possibly blockers
    unbalancedQuotes: number, // "1 '2" / '1 "2'
    // blockers
    unmatchedQuotes: number,
    lastCharMeaningfulBacktick: number,
} & ProcessEnvPowerShellTelemetry

export function parsePowerShellArguments(inputArgs: string): [string[], PowerShellTelemetry] {
    const escapingSymbol = '`'
    const quoteTypes = ['\'', '"']
    const specialCharacters = ['$', ';', '@', '&']

    const resultArgs: string[] = []
    let currentArg = ''
    let escaped = false
    let activeQuote = ''
    let passiveQuote = ''

    const [processedArgs, envTelemetry] = processPowerShellEnVariables(inputArgs)

    const telemetry = {
        ...envTelemetry,
        nestedQuotes: 0,
        closedQuotePairs: 0,
        escapedQuotes: 0,
        backticks: 0,
        escapedBackticks: 0,
        backticksInSingleQuotes: 0,
        specialCharacters: 0,
        // possibly blockers
        unbalancedQuotes: 0, // "1 '2" / '1 "2'
        // blockers
        unmatchedQuotes: 0,
        lastCharMeaningfulBacktick: 0,
    }

    for (const currentChar of processedArgs) {
        if (currentChar === ' ') {
            if (activeQuote) {
                currentArg += currentChar
            } else {
                currentArg && resultArgs.push(currentArg)
                escaped && telemetry.lastCharMeaningfulBacktick++

                currentArg = ''
            }

            continue
        }

        if (currentChar === escapingSymbol) {
            telemetry.backticks++
            if (escaped) {
                currentArg += currentChar
                escaped = false
                telemetry.escapedBackticks++

                continue
            }
            if (activeQuote === '\'') {
                currentArg += currentChar
                telemetry.backticksInSingleQuotes++

                continue
            }

            escaped = true

            continue
        }

        if (quoteTypes.includes(currentChar)) {
            if (escaped) {
                currentArg += currentChar
                escaped = false
                telemetry.escapedQuotes++

                continue
            }
            if (currentChar === activeQuote) {
                activeQuote = ''
                telemetry.closedQuotePairs++

                if (passiveQuote) {
                    passiveQuote = ''
                    telemetry.unbalancedQuotes++
                }

                continue
            }
            if (activeQuote) {
                currentArg += currentChar
                escaped = false
                telemetry.nestedQuotes++

                passiveQuote = passiveQuote ? '' : currentChar

                continue
            }
            activeQuote = currentChar

            continue
        }

        currentArg += currentChar
        escaped = false

        if (specialCharacters.includes(currentArg)) {
            telemetry.specialCharacters++
        }
    }

    currentArg && resultArgs.push(currentArg)
    escaped && telemetry.lastCharMeaningfulBacktick++

    if (activeQuote) {
        telemetry.unmatchedQuotes = 1
    }

    return [resultArgs, telemetry]
}

type ProcessEnvPowerShellTelemetry = {
    foundPrefixes: number,
    someVariablesInsideQuotes: number,
    variablesExpanded: number,
    escapedVariables: number,
    escapedEscapingSymbols: number,
    variableStartsFromBacktick: number,
    variablesWithBacktickInside: number,
    envQuottedBlocks: number,
    // blockers
    envUnmatchedQuotes: number
}

function processPowerShellEnVariables(argsLine: string): [string, ProcessEnvPowerShellTelemetry] {
    const envPrefix = '$env:'
    const quote = '\''
    const escapingSymbol = '`'

    const telemetry = {
        foundPrefixes: 0,
        someVariablesInsideQuotes: 0,
        variablesExpanded: 0,
        escapedVariables: 0,
        escapedEscapingSymbols: 0,
        variableStartsFromBacktick: 0,
        variablesWithBacktickInside: 0,
        envQuottedBlocks: 0,
        // blockers
        envUnmatchedQuotes: 0
    }
    let result = argsLine
    let startIndex = 0

    while (true) {
        const prefixIndex = result.toLowerCase().indexOf(envPrefix, startIndex)
        if (prefixIndex < 0) {
            break;
        }

        telemetry.foundPrefixes++

        if (result[prefixIndex - 1] === escapingSymbol) {
            if (!result[prefixIndex - 2] || result[prefixIndex - 2] !== escapingSymbol) {
                startIndex++
                result = result.substring(0, prefixIndex - 1) + result.substring(prefixIndex)

                telemetry.escapedVariables++

                continue
            }

            telemetry.escapedEscapingSymbols++
        }

        const quoteIndex = result.indexOf(quote, startIndex)
        if (quoteIndex >= 0 && prefixIndex > quoteIndex) {
            const nextQuoteIndex = result.indexOf(quote, quoteIndex + 1)
            if (nextQuoteIndex < 0) {
                telemetry.envUnmatchedQuotes = 1
                // we properly should throw error here
                // throw new Error('Quotes not enclosed.')
                break
            }

            startIndex = nextQuoteIndex + 1

            telemetry.envQuottedBlocks++

            continue
        }

        let envName = '';
        let envEndIndex = 0;

        const envStartIndex = prefixIndex + envPrefix.length

        envName = result.substring(envStartIndex).split(/[ |"|'|;|$]/)[0]
        envEndIndex = envStartIndex + envName.length

        if (envName.startsWith(escapingSymbol)) {
            const sanitizedEnvName = '$env:' + envName.substring(1)
            result = result.substring(0, prefixIndex) + sanitizedEnvName + result.substring(envEndIndex)
            startIndex = prefixIndex + sanitizedEnvName.length

            telemetry.variableStartsFromBacktick++

            continue
        }

        let head = result.substring(0, prefixIndex)
        if (envName.includes(escapingSymbol)) {
            head = head + envName.split(escapingSymbol)[1]
            envName = envName.split(escapingSymbol)[0]

            telemetry.variablesWithBacktickInside++
        }

        const envValue = process.env[envName] ?? '';
        const tail = result.substring(envEndIndex)

        result = head + envValue + tail
        startIndex = prefixIndex + envValue.length

        telemetry.variablesExpanded++

        continue
    }

    return [result, telemetry]
}
