import AppKit
import CoreGraphics

/// Detects a double-tap of the Command key, globally.
///
/// A "tap" is Command pressed and released with no other key or modifier in
/// between. Two clean taps within `windowSeconds` fire `onTrigger`. This can't be
/// done with the Carbon hot-key API (it needs a real key+modifier combo), so it
/// uses a listen-only CGEventTap — which requires the one-time Input Monitoring
/// grant. Using a tap (rather than an NSEvent monitor) keeps the permission
/// coherent: `CGRequestListenEventAccess` governs exactly this mechanism.
final class DoubleTapCommand {
    var onTrigger: () -> Void = {}

    /// Gap allowed between the two taps, measured from the first *release* to the
    /// second *press* — so holding the second tap down doesn't run out the clock.
    /// Timing the two releases instead made a deliberate "tap, tap-and-hold" miss.
    private let gapSeconds: TimeInterval = 0.45

    /// A press held longer than this is someone using Command, not tapping it.
    private let maxHoldSeconds: TimeInterval = 0.5

    private var pressedAt: TimeInterval = 0
    private var lastTapEndedAt: TimeInterval = 0
    private var isSecondTap = false
    private var commandDown = false
    private var cleanStart = false
    private var otherKeyWhileDown = false

    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var retryTimer: Timer?
    private var retryCount = 0

    /// Whether the hotkey is actually listening. False means the Input Monitoring
    /// grant is missing — re-signing the app on every build can revoke it.
    var isActive: Bool {
        guard let tap = eventTap else { return false }
        return CGEvent.tapIsEnabled(tap: tap)
    }

    func start() {
        if !CGPreflightListenEventAccess() {
            // Triggers the Input Monitoring prompt on first launch.
            CGRequestListenEventAccess()
        }
        installTap()

        // The system disables event taps across sleep, lock and fast user
        // switching, without ever calling back — the hotkey would just go dead
        // until the next time the menu was opened.
        let workspace = NSWorkspace.shared.notificationCenter
        for name in [NSWorkspace.didWakeNotification, NSWorkspace.sessionDidBecomeActiveNotification] {
            workspace.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.retryIfNeeded()
            }
        }
    }

    /// Creates the tap. If the grant isn't in place yet, `tapCreate` returns nil;
    /// we retry on a timer so the hotkey starts working as soon as it's granted,
    /// without relaunching the app.
    private func installTap() {
        guard eventTap == nil else { return }

        let mask = (1 << CGEventType.flagsChanged.rawValue) | (1 << CGEventType.keyDown.rawValue)
        let callback: CGEventTapCallBack = { _, type, event, userInfo in
            if let userInfo {
                let owner = Unmanaged<DoubleTapCommand>.fromOpaque(userInfo).takeUnretainedValue()
                owner.handle(type: type, flags: event.flags)
            }
            return Unmanaged.passUnretained(event)
        }

        guard
            let tap = CGEvent.tapCreate(
                tap: .cgSessionEventTap,
                place: .headInsertEventTap,
                options: .listenOnly,
                eventsOfInterest: CGEventMask(mask),
                callback: callback,
                userInfo: Unmanaged.passUnretained(self).toOpaque()
            )
        else {
            scheduleRetry()
            return
        }

        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        eventTap = tap
        runLoopSource = source
        retryTimer?.invalidate()
        retryTimer = nil
    }

    /// Re-arms the hotkey: re-enables a tap the system disabled, or creates one
    /// that never came up (the Input Monitoring grant may have landed since).
    /// No-op when the tap is already live.
    func retryIfNeeded() {
        if let tap = eventTap {
            if !CGEvent.tapIsEnabled(tap: tap) {
                CGEvent.tapEnable(tap: tap, enable: true)
            }
            return
        }
        retryCount = 0
        installTap()
    }

    /// Retry on a timer, but bounded — if the grant never comes we stop after a
    /// minute rather than waking up forever. `retryIfNeeded()` restarts it.
    private func scheduleRetry() {
        guard retryTimer == nil else { return }
        retryCount = 0
        retryTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] timer in
            guard let self else {
                timer.invalidate()
                return
            }
            self.retryCount += 1
            self.installTap()
            if self.eventTap != nil || self.retryCount >= 30 {
                timer.invalidate()
                self.retryTimer = nil
            }
        }
    }

    /// The whole detector, driven only by (type, flags) — so `--selftest` can
    /// replay a summon without an event tap or a real keyboard.
    func handle(type: CGEventType, flags: CGEventFlags) {
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            // Re-arm, and forget the half-seen tap: the events in between are lost,
            // so Command may well be up while we still think it's down.
            commandDown = false
            lastTapEndedAt = 0
            if let tap = eventTap {
                CGEvent.tapEnable(tap: tap, enable: true)
            }
            return
        }

        if type == .keyDown {
            // A real key while Command is held means a shortcut, not a clean tap.
            if commandDown { otherKeyWhileDown = true }
            return
        }

        // flagsChanged
        let commandIsDown = flags.contains(.maskCommand)
        let others: CGEventFlags = [.maskShift, .maskAlternate, .maskControl, .maskSecondaryFn]
        let hasOther = !flags.isDisjoint(with: others)

        let now = ProcessInfo.processInfo.systemUptime

        if commandIsDown, !commandDown {
            // Command just went down: a tap may be starting, and it counts as the
            // second one if it lands close enough behind a clean first tap.
            commandDown = true
            cleanStart = !hasOther
            otherKeyWhileDown = false
            pressedAt = now
            isSecondTap = lastTapEndedAt > 0 && now - lastTapEndedAt <= gapSeconds
        } else if !commandIsDown, commandDown {
            // Command just came up: the tap ends here.
            commandDown = false
            let clean =
                cleanStart && !otherKeyWhileDown && !hasOther
                && now - pressedAt <= maxHoldSeconds
            guard clean else {
                lastTapEndedAt = 0
                return
            }
            if isSecondTap {
                lastTapEndedAt = 0
                isSecondTap = false
                onTrigger()
            } else {
                lastTapEndedAt = now
            }
        }
    }
}
