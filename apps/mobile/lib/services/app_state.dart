import 'dart:async';

import 'package:flutter/foundation.dart';

import '../models/models.dart';
import 'auth_service.dart';
import 'demo_data.dart';
import 'sentra_api.dart';

/// The app's single source of truth.
///
/// Small and explicit rather than a state-management framework: this app has one signed-in
/// person, one list of guardians and one activity feed, and being able to read the whole of it
/// in one file is worth more here than indirection.
class AppState extends ChangeNotifier {
  AppState({SentraApi? api}) : api = api ?? SentraApi();

  final SentraApi api;

  bool bankConnected = false;

  /// Which bank the customer linked, so the app can name it back to them.
  String? bankId;
  String subjectRef = DemoData.subjectRef;

  List<ActivityEntry> activity = [];
  List<Guardian> guardians = [];
  List<Guardian> protecting = [];
  GuardianRequest? pendingRequest;

  int get checksThisWeek =>
      activity.where((a) => DateTime.now().difference(a.at).inDays < 7).length;

  int get threatsStopped => activity.where((a) => a.kind == ActivityKind.held).length;

  /// The first name to greet the person by, taken from the real session when there is one.
  String get personName {
    final full = AuthSession.displayName;
    return full.trim().isEmpty ? DemoData.personName : full.trim().split(' ').first;
  }

  String get email => AuthSession.email;

  /// Called once the bank has redirected back and the link is established.
  void connectBank({String? bankId}) {
    this.bankId = bankId;
    bankConnected = true;
    activity = DemoData.activity();
    guardians = DemoData.guardians();
    protecting = DemoData.protecting();
    pendingRequest = DemoData.pendingRequest();
    notifyListeners();
  }

  Future<void> signOut() async {
    await AuthSession.signOut();
    bankConnected = false;
    bankId = null;
    activity = [];
    guardians = [];
    protecting = [];
    pendingRequest = null;
    notifyListeners();
  }

  /// Records the outcome of an interception in the log, and reports it to the engine — which is
  /// the only moment the engine learns anything.
  void recordOutcome(ProtectionSession session, {required bool cancelled}) {
    activity = [
      ActivityEntry(
        id: 'a_${DateTime.now().millisecondsSinceEpoch}',
        kind: cancelled ? ActivityKind.held : ActivityKind.warned,
        title: cancelled
            ? 'Payment held — ${session.currency == 'GBP' ? '£' : ''}${session.amount.toStringAsFixed(0)}'
            : 'Warned — you chose to send',
        subtitle: cancelled
            ? 'You cancelled it after we flagged a scam'
            : 'Sent to ${session.payeeLabel ?? 'a payee'} after the warning',
        at: DateTime.now(),
        amount: session.amount,
        caseReference: session.caseReference,
      ),
      ...activity,
    ];
    notifyListeners();

    // Best effort: a learning call must never block the person's next screen.
    unawaited(
      api
          .resolveSession(session.sessionId, cancelled ? 'ABANDONED' : 'SENT',
              confirmedScam: cancelled ? true : null)
          .catchError((_) {}),
    );
  }

  void addGuardian(String name) {
    guardians = [
      ...guardians,
      Guardian(
        id: 'g_${DateTime.now().millisecondsSinceEpoch}',
        name: name,
        // Named, but nothing happens until the other person accepts.
        status: GuardianStatus.pending,
        route: ReviewRoute.guardianThenBank,
        bankConnected: false,
      ),
    ];
    notifyListeners();
  }

  void removeGuardian(String id) {
    guardians = guardians.where((g) => g.id != id).toList();
    notifyListeners();
  }

  void resolveRequest({required bool approved}) {
    final request = pendingRequest;
    if (request == null) return;
    pendingRequest = null;
    activity = [
      ActivityEntry(
        id: 'a_${DateTime.now().millisecondsSinceEpoch}',
        kind: approved ? ActivityKind.guardianApproved : ActivityKind.held,
        title: approved
            ? 'You approved a payment for ${request.forPersonName}'
            : 'You kept a payment held for ${request.forPersonName}',
        subtitle: '${formatAmountShort(request.amount)} to ${request.payeeLabel}',
        at: DateTime.now(),
        amount: request.amount,
        caseReference: request.caseReference,
      ),
      ...activity,
    ];
    notifyListeners();
  }

  static String formatAmountShort(double amount) => '£${amount.toStringAsFixed(0)}';
}
