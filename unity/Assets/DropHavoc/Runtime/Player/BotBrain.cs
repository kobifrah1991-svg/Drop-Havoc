using UnityEngine;

namespace DropHavoc
{
    // Server-side bot for practice mode and to fill empty slots (GDD §5).
    public class BotBrain : MonoBehaviour
    {
        const float SightRange = 45f;

        PlayerNetwork pn;
        CharacterController cc;
        Vector3 vel;
        Vector3? waypoint;
        float stuck, sideBias = 1, modeT, sideT, pace = 0.5f, curF, curS, reactAt, aimError, yaw, pitch, lastSeen;
        PlayerNetwork target;
        enum Mode { Wander, Approach, Hold, Circle, Retreat }
        Mode mode = Mode.Wander;

        void OnEnable()
        {
            pn = GetComponent<PlayerNetwork>();
            cc = GetComponent<CharacterController>();
            yaw = transform.eulerAngles.y;
            sideBias = Random.value < 0.5f ? -1 : 1;
        }

        public void OnAttacked(PlayerNetwork attacker)
        {
            if (target == null) { target = attacker; lastSeen = Time.time; }
        }

        void Update()
        {
            if (!pn.IsSpawned || !pn.Alive.Value) { target = null; return; }
            var match = MatchManager.Instance;
            if (match == null || !match.Playing) return;
            float dt = Time.deltaTime;
            float wantF = 0, wantS = 0;
            bool jump = false;

            PickTarget();
            if (target != null)
            {
                Vector3 to = target.transform.position - transform.position;
                float dist = to.magnitude;
                Vector3 aimPoint = target.transform.position + Vector3.up * 1.0f;
                Vector3 aimDir = aimPoint - pn.Eye;
                float wantYaw = Mathf.Atan2(aimDir.x, aimDir.z) * Mathf.Rad2Deg;
                float wantPitch = -Mathf.Atan2(aimDir.y, new Vector2(aimDir.x, aimDir.z).magnitude) * Mathf.Rad2Deg;
                yaw = Mathf.LerpAngle(yaw, wantYaw, Mathf.Min(1, dt * 6));
                pitch = Mathf.Lerp(pitch, wantPitch, Mathf.Min(1, dt * 6));
                aimError = Mathf.Max(0.055f, aimError - dt * 0.15f);

                // Stable combat modes with 2-4 s timers instead of random jittery strafing
                modeT -= dt;
                if (modeT <= 0 || (mode == Mode.Approach && dist < 9) || (mode == Mode.Retreat && dist > 12)) PickMode(dist);
                switch (mode)
                {
                    case Mode.Approach: wantF = dist > 30 ? 1 : 0.6f; wantS = 0.15f * sideBias; break;
                    case Mode.Retreat: wantF = -0.55f; wantS = 0.2f * sideBias; break;
                    case Mode.Circle: wantS = 0.4f * sideBias; break;
                    default: break; // Hold
                }

                int weapon = dist < 7 ? 1 : 0; // shotgun up close, rifle otherwise
                var w = WeaponCatalog.Get(weapon);
                if (pn.ServerAmmo(weapon) <= 0) pn.ServerReload(weapon);
                if (Time.time > reactAt && Mathf.Abs(Mathf.DeltaAngle(yaw, wantYaw)) < 15f)
                {
                    var dirs = new Vector3[w.pellets];
                    for (int i = 0; i < dirs.Length; i++)
                    {
                        float e = (aimError + w.hipSpread) * Mathf.Rad2Deg;
                        dirs[i] = Quaternion.Euler(pitch + Random.Range(-e, e), yaw + Random.Range(-e, e), 0) * Vector3.forward;
                    }
                    pn.ServerFire(weapon, pn.Eye, dirs);
                }
            }
            else
            {
                mode = Mode.Wander;
                if (waypoint == null || Flat(waypoint.Value - transform.position) < 1.5f || stuck > 2.2f)
                {
                    waypoint = Arena.Waypoints[Random.Range(0, Arena.Waypoints.Length)];
                    stuck = 0; sideT = 0;
                    float far = Flat(waypoint.Value - transform.position);
                    pace = far > 35 || Random.value < 0.2f ? 1f : Random.Range(0.45f, 0.6f); // walk mostly, run for long trips
                }
                Vector3 to = waypoint.Value - transform.position;
                float want = Mathf.Atan2(to.x, to.z) * Mathf.Rad2Deg;
                float dyaw = Mathf.Abs(Mathf.DeltaAngle(yaw, want)) * Mathf.Deg2Rad;
                yaw = Mathf.LerpAngle(yaw, want, Mathf.Min(1, dt * 4));
                pitch = Mathf.Lerp(pitch, 0, dt * 3);
                wantF = dyaw < 0.35f ? pace : dyaw < 1f ? 0.2f : 0; // turn first, then move
                stuck = wantF > 0.1f && Flat(vel) < 1f ? stuck + dt : Mathf.Max(0, stuck - dt);
                if (stuck > 0.6f) { if (sideT <= 0) sideT = 0.6f; wantS = sideBias; wantF = 0.3f; } // short sidestep first
                if (sideT > 0) sideT -= dt;
                jump = stuck > 1.6f; // jump only after a long stall
            }

            curF = Mathf.Lerp(curF, wantF, Mathf.Min(1, dt * 4));
            curS = Mathf.Lerp(curS, wantS, Mathf.Min(1, dt * 3));
            Vector2 input = new Vector2(curS, curF);
            transform.rotation = Quaternion.Euler(0, yaw, 0);
            PlayerMotor.Step(cc, ref vel, input, jump, yaw, false, dt);
            pn.NetYaw.Value = yaw;
            pn.NetPitch.Value = pitch;
        }

        void PickMode(float dist)
        {
            float r = Random.value;
            mode = dist > 22 ? Mode.Approach : dist < 6 ? Mode.Retreat : r < 0.45f ? Mode.Hold : r < 0.8f ? Mode.Circle : Mode.Approach;
            modeT = Random.Range(2f, 4f);
            if (Random.value < 0.25f) sideBias = -sideBias;
        }

        void PickTarget()
        {
            PlayerNetwork best = null;
            float bestDist = SightRange;
            foreach (var o in PlayerNetwork.All)
            {
                if (o == pn || !o.Alive.Value || o.Protected.Value) continue;
                float d = Vector3.Distance(o.transform.position, transform.position);
                bool remembered = o == target && Time.time - lastSeen < 2f;
                if ((d < bestDist || remembered) && CanSee(o)) { best = o; bestDist = d; }
            }
            if (best != null && best != target) { reactAt = Time.time + Random.Range(0.5f, 1f); aimError = 0.3f; modeT = 0; }
            if (best != null) lastSeen = Time.time;
            target = best;
        }

        bool CanSee(PlayerNetwork o)
        {
            Vector3 from = pn.Eye, to = o.transform.position + Vector3.up * 1.2f;
            if (Physics.Raycast(from, to - from, out var hit, Vector3.Distance(from, to), ~0, QueryTriggerInteraction.Ignore))
                return hit.collider.GetComponentInParent<PlayerNetwork>() == o;
            return true;
        }

        static float Flat(Vector3 v) => new Vector2(v.x, v.z).magnitude;
    }
}
